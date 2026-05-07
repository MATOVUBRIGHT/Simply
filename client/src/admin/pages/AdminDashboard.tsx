import { useEffect, useState } from 'react';
import { School, Users, CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle, ShieldOff, RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { PLAN_DEFINITIONS } from '../../utils/plans';
import { useAdminTheme } from '../AdminThemeContext';

interface Stats {
  totalSchools: number;
  activeSchools: number;
  expiredSchools: number;
  pendingSchools: number;
  totalUsers: number;
  totalStudents: number;
  recentSubscriptions: RecentSub[];
}

interface RecentSub {
  id: string;
  schoolId: string;
  schoolName: string;
  plan: string;
  status: string;
  endsAt: string | null;
  updatedAt: string;
}

export default function AdminDashboard() {
  const { isDark, t } = useAdminTheme();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState('');
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }
    setLoading(true);
    try {
      const [usersRes, subsRes, studentsRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, school_id, email, first_name, last_name, is_active, created_at'),
        supabase.from('subscriptions').select('id, school_id, plan, status, ends_at, updated_at').order('updated_at', { ascending: false }),
        supabase.from('students').select('id, school_id, status'),
        supabase.from('settings').select('school_id, key, value').eq('key', 'schoolName'),
      ]);

      const users = usersRes.data || [];
      const subs = subsRes.data || [];
      const students = studentsRes.data || [];
      const settings = settingsRes.data || [];

      const schoolNames: Record<string, string> = {};
      settings.forEach((s: any) => { if (s.school_id && s.value) schoolNames[s.school_id] = String(s.value); });

      const now = Date.now();
      const uniqueSchools = [...new Set(users.map((u: any) => u.school_id).filter(Boolean))];

      const schoolSubMap: Record<string, any> = {};
      subs.forEach((sub: any) => {
        const sid = sub.school_id;
        if (!sid) return;
        if (!schoolSubMap[sid] || new Date(sub.updated_at) > new Date(schoolSubMap[sid].updated_at)) schoolSubMap[sid] = sub;
      });

      let activeSchools = 0, expiredSchools = 0, pendingSchools = 0;
      uniqueSchools.forEach(sid => {
        const sub = schoolSubMap[sid];
        if (!sub) { pendingSchools++; return; }
        const ends = sub.ends_at ? new Date(sub.ends_at).getTime() : 0;
        if (ends > now) activeSchools++;
        else expiredSchools++;
      });

      const recentSubscriptions: RecentSub[] = subs.slice(0, 10).map((sub: any) => ({
        id: sub.id,
        schoolId: sub.school_id,
        schoolName: schoolNames[sub.school_id] || sub.school_id?.slice(0, 8) + '...',
        plan: sub.plan || 'unknown',
        status: sub.ends_at && new Date(sub.ends_at).getTime() > now ? 'active' : 'expired',
        endsAt: sub.ends_at,
        updatedAt: sub.updated_at,
      }));

      setStats({ totalSchools: uniqueSchools.length, activeSchools, expiredSchools, pendingSchools, totalUsers: users.length, totalStudents: students.length, recentSubscriptions });
    } catch (err: any) {
      setError(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }

  async function revokeAllAccess() {
    if (!supabase) return;
    setRevoking(true);
    setError('');
    try {
      const now = new Date();
      const past = new Date(now.getTime() - 1000).toISOString();

      // Expire all active subscriptions
      await supabase.from('subscriptions').update({
        ends_at: past,
        status: 'revoked',
        updated_at: now.toISOString(),
        metadata: { revokedByAdmin: true, revokedAt: now.toISOString() },
      }).neq('status', 'revoked');

      // Update all settings to mark ineligible
      await supabase.from('settings').update({
        value: false,
        updated_at: now.toISOString(),
      }).eq('key', 'subscriptionPlanEligible');

      await supabase.from('settings').update({
        value: past,
        updated_at: now.toISOString(),
      }).eq('key', 'subscriptionExpiryDate');

      setRevokeSuccess('All school access has been revoked. Schools must resubscribe and get admin approval.');
      setShowRevokeModal(false);
      await loadStats();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke access');
    } finally {
      setRevoking(false);
    }
  }

  const statCards = [
    { label: 'Total Schools', value: stats?.totalSchools ?? 0, icon: School, color: 'indigo' as const, desc: 'Registered' },
    { label: 'Active Plans', value: stats?.activeSchools ?? 0, icon: CheckCircle, color: 'green' as const, desc: 'With valid plan' },
    { label: 'Expired', value: stats?.expiredSchools ?? 0, icon: XCircle, color: 'red' as const, desc: 'Need renewal' },
    { label: 'No Plan', value: stats?.pendingSchools ?? 0, icon: Clock, color: 'amber' as const, desc: 'Never subscribed' },
    { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: Users, color: 'violet' as const, desc: 'Accounts' },
    { label: 'Total Students', value: stats?.totalStudents ?? 0, icon: TrendingUp, color: 'cyan' as const, desc: 'Enrolled' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className={`w-8 h-8 border-4 ${isDark ? 'border-slate-700' : 'border-slate-200'} border-t-indigo-500 rounded-full animate-spin`} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${t.text}`}>Dashboard</h1>
          <p className={`text-sm mt-0.5 ${t.muted}`}>Overview of all schools and subscriptions</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadStats} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'}`}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setShowRevokeModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-500/20"
          >
            <ShieldOff size={14} /> Revoke All Access
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>}
      {revokeSuccess && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm flex items-center gap-2"><AlertTriangle size={16} />{revokeSuccess}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, desc }) => (
          <div key={label} className={`rounded-2xl border p-5 ${t.statCard(color)} relative overflow-hidden`}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
            <div className="relative">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <Icon size={20} className="text-white" />
              </div>
              <p className="text-3xl font-bold text-white">{value}</p>
              <p className="text-sm font-medium text-white/90 mt-0.5">{label}</p>
              <p className="text-xs text-white/60 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent subscriptions */}
      <div className={`${t.surface} border rounded-2xl overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${t.divider} flex items-center gap-2`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-amber-900/40' : 'bg-amber-100'}`}>
            <AlertTriangle size={14} className="text-amber-500" />
          </div>
          <h2 className={`text-sm font-semibold ${t.text}`}>Recent Subscription Activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${t.divider} ${isDark ? 'bg-slate-800/30' : 'bg-slate-50/80'}`}>
                <th className={`text-left px-5 py-3 text-xs font-semibold ${t.muted} uppercase tracking-wide`}>School</th>
                <th className={`text-left px-5 py-3 text-xs font-semibold ${t.muted} uppercase tracking-wide`}>Plan</th>
                <th className={`text-left px-5 py-3 text-xs font-semibold ${t.muted} uppercase tracking-wide`}>Status</th>
                <th className={`text-left px-5 py-3 text-xs font-semibold ${t.muted} uppercase tracking-wide`}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.recentSubscriptions || []).map(sub => (
                <tr key={sub.id} className={`border-b ${t.divider} ${t.rowHover} transition-colors`}>
                  <td className={`px-5 py-3.5 font-medium ${t.text}`}>{sub.schoolName}</td>
                  <td className={`px-5 py-3.5 ${t.muted} capitalize`}>
                    {PLAN_DEFINITIONS.find(p => p.id === sub.plan)?.name || sub.plan}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      sub.status === 'active' ? t.badge('green') : t.badge('red')
                    }`}>
                      {sub.status === 'active' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                      {sub.status}
                    </span>
                  </td>
                  <td className={`px-5 py-3.5 text-xs ${t.muted}`}>
                    {sub.endsAt ? new Date(sub.endsAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {!stats?.recentSubscriptions?.length && (
                <tr><td colSpan={4} className={`px-5 py-10 text-center text-sm ${t.muted}`}>No subscription data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revoke All Modal */}
      {showRevokeModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-sm ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl shadow-2xl overflow-hidden`}>
            <div className="bg-gradient-to-r from-red-600 to-red-700 p-5 text-white">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <ShieldOff size={24} className="text-white" />
              </div>
              <h2 className="text-lg font-bold">Revoke All Access</h2>
              <p className="text-red-100 text-sm mt-1">This will immediately block ALL schools from accessing the app.</p>
            </div>
            <div className="p-5 space-y-4">
              <div className={`rounded-xl p-3 text-sm ${isDark ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                <p className="font-medium mb-1">What this does:</p>
                <ul className="space-y-0.5 text-xs list-disc list-inside">
                  <li>Expires all active subscriptions immediately</li>
                  <li>All schools see the "Subscription Expired" gate</li>
                  <li>Schools must resubscribe and get admin approval</li>
                  <li>This cannot be undone in bulk — each school must be re-granted individually</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowRevokeModal(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                  Cancel
                </button>
                <button onClick={revokeAllAccess} disabled={revoking}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                >
                  {revoking ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldOff size={14} />}
                  Revoke All
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
