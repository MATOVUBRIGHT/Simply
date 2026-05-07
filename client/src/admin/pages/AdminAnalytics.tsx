import { useEffect, useState } from 'react';
import { BarChart2, Users, Clock, TrendingUp, RefreshCw, Activity, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminTheme } from '../AdminThemeContext';

interface LoginRecord {
  schoolId: string;
  schoolName: string;
  email: string;
  lastLogin: string | null;
  loginCount: number;
  plan: string | null;
  planStatus: 'active' | 'expired' | 'no_plan';
}

interface DailyActivity {
  date: string;
  logins: number;
  newSchools: number;
}

export default function AdminAnalytics() {
  const { theme } = useAdminTheme();
  const isDark = theme === 'dark';
  const [loginRecords, setLoginRecords] = useState<LoginRecord[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<'lastLogin' | 'loginCount'>('lastLogin');

  useEffect(() => { load(); }, []);

  async function load() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const [usersRes, subsRes, settingsRes, activityRes] = await Promise.all([
        supabase.from('users').select('id, school_id, email, created_at, updated_at').order('updated_at', { ascending: false }),
        supabase.from('subscriptions').select('school_id, plan, ends_at, updated_at').order('updated_at', { ascending: false }),
        supabase.from('settings').select('school_id, key, value').in('key', ['schoolName', 'lastLoginAt', 'loginCount']),
        // Use users updated_at as proxy for last activity
        supabase.from('users').select('created_at').order('created_at', { ascending: false }).limit(100),
      ]);

      const users = usersRes.data || [];
      const subs = subsRes.data || [];
      const settings = settingsRes.data || [];

      const schoolNames: Record<string, string> = {};
      const lastLogins: Record<string, string> = {};
      const loginCounts: Record<string, number> = {};
      settings.forEach((s: any) => {
        if (s.key === 'schoolName') schoolNames[s.school_id] = String(s.value);
        if (s.key === 'lastLoginAt') lastLogins[s.school_id] = String(s.value);
        if (s.key === 'loginCount') loginCounts[s.school_id] = Number(s.value) || 0;
      });

      const schoolSubMap: Record<string, any> = {};
      subs.forEach((sub: any) => {
        const sid = sub.school_id;
        if (!sid) return;
        if (!schoolSubMap[sid] || new Date(sub.updated_at) > new Date(schoolSubMap[sid].updated_at)) {
          schoolSubMap[sid] = sub;
        }
      });

      const now = Date.now();
      const uniqueSchools = [...new Set(users.map((u: any) => u.school_id || u.id).filter(Boolean))];

      const records: LoginRecord[] = uniqueSchools.map(sid => {
        const user = users.find((u: any) => (u.school_id || u.id) === sid);
        const sub = schoolSubMap[sid];
        let planStatus: LoginRecord['planStatus'] = 'no_plan';
        if (sub) {
          const ends = sub.ends_at ? new Date(sub.ends_at).getTime() : 0;
          planStatus = ends > now ? 'active' : 'expired';
        }
        // Use updated_at as proxy for last login if no explicit lastLoginAt
        const lastLogin = lastLogins[sid] || user?.updated_at || null;
        return {
          schoolId: sid,
          schoolName: schoolNames[sid] || 'Unnamed School',
          email: user?.email || '—',
          lastLogin,
          loginCount: loginCounts[sid] || 0,
          plan: sub?.plan || null,
          planStatus,
        };
      });

      // Sort
      records.sort((a, b) => {
        if (sortBy === 'lastLogin') {
          if (!a.lastLogin) return 1;
          if (!b.lastLogin) return -1;
          return new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime();
        }
        return b.loginCount - a.loginCount;
      });

      setLoginRecords(records);

      // Build daily activity from user created_at (last 14 days)
      const activityData = activityRes.data || [];
      const dayMap: Record<string, { logins: number; newSchools: number }> = {};
      const today = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dayMap[key] = { logins: 0, newSchools: 0 };
      }
      activityData.forEach((u: any) => {
        const key = u.created_at?.split('T')[0];
        if (key && dayMap[key]) dayMap[key].newSchools++;
      });
      setDailyActivity(Object.entries(dayMap).map(([date, v]) => ({ date, ...v })));

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Theme
  const card = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const rowHover = isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50';
  const thClass = `text-left px-5 py-3 text-xs font-medium ${textMuted}`;
  const divider = isDark ? 'border-slate-800' : 'border-slate-200';

  const activeCount = loginRecords.filter(r => r.planStatus === 'active').length;
  const recentLogins = loginRecords.filter(r => r.lastLogin && Date.now() - new Date(r.lastLogin).getTime() < 7 * 24 * 60 * 60 * 1000).length;
  const maxBar = Math.max(...dailyActivity.map(d => d.newSchools), 1);

  function timeAgo(iso: string | null) {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>Analytics</h1>
          <p className={`text-sm mt-1 ${textMuted}`}>Login activity and school engagement</p>
        </div>
        <button onClick={load} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Schools', value: loginRecords.length, icon: Users, color: 'indigo' },
          { label: 'Active Plans', value: activeCount, icon: Activity, color: 'green' },
          { label: 'Active (7 days)', value: recentLogins, icon: Clock, color: 'amber' },
          { label: 'New (14 days)', value: dailyActivity.reduce((s, d) => s + d.newSchools, 0), icon: TrendingUp, color: 'violet' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`${card} border rounded-xl p-4`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${
              color === 'indigo' ? 'bg-indigo-900/40 text-indigo-400' :
              color === 'green' ? 'bg-green-900/40 text-green-400' :
              color === 'amber' ? 'bg-amber-900/40 text-amber-400' :
              'bg-violet-900/40 text-violet-400'
            }`}>
              <Icon size={18} />
            </div>
            <p className={`text-2xl font-bold ${textPrimary}`}>{value}</p>
            <p className={`text-xs ${textMuted} mt-0.5`}>{label}</p>
          </div>
        ))}
      </div>

      {/* Activity chart (last 14 days) */}
      <div className={`${card} border rounded-xl p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-indigo-400" />
          <h2 className={`text-sm font-semibold ${textPrimary}`}>New Registrations — Last 14 Days</h2>
        </div>
        <div className="flex items-end gap-1.5 h-24">
          {dailyActivity.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
              <div
                className="w-full bg-indigo-500/70 hover:bg-indigo-500 rounded-t transition-all"
                style={{ height: `${Math.max(4, (d.newSchools / maxBar) * 80)}px` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                <div className={`${isDark ? 'bg-slate-700' : 'bg-slate-800'} text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap`}>
                  {d.date.slice(5)}: {d.newSchools}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className={`text-xs ${textMuted}`}>{dailyActivity[0]?.date.slice(5)}</span>
          <span className={`text-xs ${textMuted}`}>{dailyActivity[dailyActivity.length - 1]?.date.slice(5)}</span>
        </div>
      </div>

      {/* Last login table */}
      <div className={`${card} border rounded-xl overflow-hidden`}>
        <div className={`px-5 py-4 border-b ${divider} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <BarChart2 size={16} className="text-indigo-400" />
            <h2 className={`text-sm font-semibold ${textPrimary}`}>School Login Activity</h2>
          </div>
          <div className="flex gap-2">
            {(['lastLogin', 'loginCount'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${sortBy === s ? 'bg-indigo-600 text-white' : isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                {s === 'lastLogin' ? 'Last Login' : 'Login Count'}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${divider}`}>
                  <th className={thClass}>School</th>
                  <th className={thClass}>Last Login</th>
                  <th className={thClass}>Date & Time</th>
                  <th className={thClass}>Plan</th>
                  <th className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loginRecords.map(r => (
                  <tr key={r.schoolId} className={`border-b ${divider} ${rowHover}`}>
                    <td className="px-5 py-3">
                      <p className={`font-medium text-sm ${textPrimary}`}>{r.schoolName}</p>
                      <p className={`text-xs ${textMuted}`}>{r.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-sm font-medium ${
                        r.lastLogin && Date.now() - new Date(r.lastLogin).getTime() < 24 * 60 * 60 * 1000
                          ? 'text-green-400' : textMuted
                      }`}>
                        {timeAgo(r.lastLogin)}
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-xs ${textMuted}`}>
                      {r.lastLogin ? new Date(r.lastLogin).toLocaleString() : '—'}
                    </td>
                    <td className={`px-5 py-3 text-sm ${textPrimary} capitalize`}>
                      {r.plan || '—'}
                    </td>
                    <td className="px-5 py-3">
                      {r.planStatus === 'active' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400">Active</span>}
                      {r.planStatus === 'expired' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400">Expired</span>}
                      {r.planStatus === 'no_plan' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">No Plan</span>}
                    </td>
                  </tr>
                ))}
                {!loginRecords.length && (
                  <tr><td colSpan={5} className={`px-5 py-12 text-center text-sm ${textMuted}`}>No data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
