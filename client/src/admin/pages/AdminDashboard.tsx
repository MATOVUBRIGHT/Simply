import { useEffect, useState } from 'react';
import { School, Users, CheckCircle, XCircle, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
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
  const { theme } = useAdminTheme();
  const isDark = theme === 'dark';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }
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

      // Build school name map
      const schoolNames: Record<string, string> = {};
      settings.forEach((s: any) => {
        if (s.school_id && s.value) schoolNames[s.school_id] = String(s.value);
      });

      const now = Date.now();
      const uniqueSchools = [...new Set(users.map((u: any) => u.school_id).filter(Boolean))];

      // For each school, find latest subscription
      const schoolSubMap: Record<string, any> = {};
      subs.forEach((sub: any) => {
        const sid = sub.school_id;
        if (!sid) return;
        if (!schoolSubMap[sid] || new Date(sub.updated_at) > new Date(schoolSubMap[sid].updated_at)) {
          schoolSubMap[sid] = sub;
        }
      });

      let activeSchools = 0, expiredSchools = 0, pendingSchools = 0;
      uniqueSchools.forEach(sid => {
        const sub = schoolSubMap[sid];
        if (!sub) { pendingSchools++; return; }
        const ends = sub.ends_at ? new Date(sub.ends_at).getTime() : 0;
        if (ends > now) activeSchools++;
        else expiredSchools++;
      });

      // Recent subscriptions (last 10)
      const recentSubscriptions: RecentSub[] = subs.slice(0, 10).map((sub: any) => ({
        id: sub.id,
        schoolId: sub.school_id,
        schoolName: schoolNames[sub.school_id] || sub.school_id?.slice(0, 8) + '...',
        plan: sub.plan || 'unknown',
        status: sub.ends_at && new Date(sub.ends_at).getTime() > now ? 'active' : 'expired',
        endsAt: sub.ends_at,
        updatedAt: sub.updated_at,
      }));

      setStats({
        totalSchools: uniqueSchools.length,
        activeSchools,
        expiredSchools,
        pendingSchools,
        totalUsers: users.length,
        totalStudents: students.length,
        recentSubscriptions,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }

  const card = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const divider = isDark ? 'border-slate-800' : 'border-slate-200';
  const rowHover = isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
      {error}
    </div>
  );

  const statCards = [
    { label: 'Total Schools', value: stats?.totalSchools ?? 0, icon: School, color: 'indigo' },
    { label: 'Active', value: stats?.activeSchools ?? 0, icon: CheckCircle, color: 'green' },
    { label: 'Expired', value: stats?.expiredSchools ?? 0, icon: XCircle, color: 'red' },
    { label: 'No Plan', value: stats?.pendingSchools ?? 0, icon: Clock, color: 'amber' },
    { label: 'Total Users', value: stats?.totalUsers ?? 0, icon: Users, color: 'violet' },
    { label: 'Total Students', value: stats?.totalStudents ?? 0, icon: TrendingUp, color: 'cyan' },
  ];

  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-900/30 text-indigo-400 border-indigo-800',
    green: 'bg-green-900/30 text-green-400 border-green-800',
    red: 'bg-red-900/30 text-red-400 border-red-800',
    amber: 'bg-amber-900/30 text-amber-400 border-amber-800',
    violet: 'bg-violet-900/30 text-violet-400 border-violet-800',
    cyan: 'bg-cyan-900/30 text-cyan-400 border-cyan-800',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-2xl font-bold ${textPrimary}`}>Dashboard</h1>
        <p className={`text-sm mt-1 ${textMuted}`}>Overview of all schools and subscriptions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`rounded-xl border p-4 ${colorMap[color]}`}>
            <div className="flex items-center gap-3">
              <Icon size={20} />
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs opacity-70">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={`${card} border rounded-xl overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${divider} flex items-center gap-2`}>
          <AlertTriangle size={16} className="text-amber-400" />
          <h2 className={`text-sm font-semibold ${textPrimary}`}>Recent Subscription Activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${divider}`}>
                <th className={`text-left px-5 py-3 text-xs font-medium ${textMuted}`}>School</th>
                <th className={`text-left px-5 py-3 text-xs font-medium ${textMuted}`}>Plan</th>
                <th className={`text-left px-5 py-3 text-xs font-medium ${textMuted}`}>Status</th>
                <th className={`text-left px-5 py-3 text-xs font-medium ${textMuted}`}>Expires</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.recentSubscriptions || []).map(sub => (
                <tr key={sub.id} className={`border-b ${divider} ${rowHover}`}>
                  <td className={`px-5 py-3 font-medium ${textPrimary}`}>{sub.schoolName}</td>
                  <td className={`px-5 py-3 ${textMuted} capitalize`}>
                    {PLAN_DEFINITIONS.find(p => p.id === sub.plan)?.name || sub.plan}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      sub.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                    }`}>
                      {sub.status === 'active' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                      {sub.status}
                    </span>
                  </td>
                  <td className={`px-5 py-3 text-xs ${textMuted}`}>
                    {sub.endsAt ? new Date(sub.endsAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {!stats?.recentSubscriptions?.length && (
                <tr><td colSpan={4} className={`px-5 py-8 text-center text-sm ${textMuted}`}>No subscription data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
