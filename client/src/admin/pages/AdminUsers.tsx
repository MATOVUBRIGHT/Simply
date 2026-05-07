import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, CheckCircle, XCircle, School, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminTheme } from '../AdminThemeContext';
import { PLAN_DEFINITIONS } from '../../utils/plans';

interface UserRow {
  id: string;
  schoolId: string;
  schoolName: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  planStatus: 'active' | 'expired' | 'no_plan';
  plan: string | null;
  endsAt: string | null;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { isDark, t } = useAdminTheme();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'no_plan'>('all');
  const [error, setError] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }
    setLoading(true);
    try {
      const [usersRes, subsRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, school_id, email, first_name, last_name, is_active, created_at').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('school_id, plan, ends_at, updated_at').order('updated_at', { ascending: false }),
        supabase.from('settings').select('school_id, key, value').eq('key', 'schoolName'),
      ]);

      const rawUsers = usersRes.data || [];
      const subs = subsRes.data || [];
      const settings = settingsRes.data || [];

      const schoolNames: Record<string, string> = {};
      settings.forEach((s: any) => { if (s.school_id && s.value) schoolNames[s.school_id] = String(s.value); });

      const schoolSubMap: Record<string, any> = {};
      subs.forEach((sub: any) => {
        const sid = sub.school_id;
        if (!sid) return;
        if (!schoolSubMap[sid] || new Date(sub.updated_at) > new Date(schoolSubMap[sid].updated_at)) schoolSubMap[sid] = sub;
      });

      const now = Date.now();
      const rows: UserRow[] = rawUsers.map((u: any) => {
        const sid = u.school_id || u.id;
        const sub = schoolSubMap[sid];
        let planStatus: UserRow['planStatus'] = 'no_plan';
        if (sub) {
          const ends = sub.ends_at ? new Date(sub.ends_at).getTime() : 0;
          planStatus = ends > now ? 'active' : 'expired';
        }
        return {
          id: u.id, schoolId: sid,
          schoolName: schoolNames[sid] || 'Unnamed School',
          email: u.email,
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          isActive: u.is_active,
          createdAt: u.created_at,
          planStatus,
          plan: sub?.plan || null,
          endsAt: sub?.ends_at || null,
        };
      });

      setUsers(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = u.email.toLowerCase().includes(q) || u.schoolName.toLowerCase().includes(q) || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q);
    return matchSearch && (filter === 'all' || u.planStatus === filter);
  });

  const planBadge = (status: UserRow['planStatus']) => {
    if (status === 'active') return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${t.badge('green')}`}><CheckCircle size={10} />Active</span>;
    if (status === 'expired') return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${t.badge('red')}`}><XCircle size={10} />Expired</span>;
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${t.badge('amber')}`}><Clock size={10} />No Plan</span>;
  };

  const counts = {
    all: users.length,
    active: users.filter(u => u.planStatus === 'active').length,
    expired: users.filter(u => u.planStatus === 'expired').length,
    no_plan: users.filter(u => u.planStatus === 'no_plan').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${t.text}`}>Users</h1>
          <p className={`text-sm mt-0.5 ${t.muted}`}>{users.length} registered users</p>
        </div>
        <button onClick={loadUsers} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'}`}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className={`rounded-xl p-4 text-sm ${isDark ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>{error}</div>}

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.muted}`} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email, name, or school..."
            className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${t.input}`}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'expired', 'no_plan'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                filter === f
                  ? f === 'active' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                    : f === 'expired' ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                    : f === 'no_plan' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : isDark ? 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'
                    : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm'
              }`}
            >
              {f === 'no_plan' ? 'No Plan' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === f ? 'bg-white/20' : isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className={`${t.surface} border rounded-2xl overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className={`w-8 h-8 border-4 ${isDark ? 'border-slate-700' : 'border-slate-200'} border-t-indigo-500 rounded-full animate-spin`} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${t.divider} ${isDark ? 'bg-slate-800/30' : 'bg-slate-50/80'}`}>
                  {['User', 'School', 'Plan', 'Expires', 'Joined', ''].map(h => (
                    <th key={h} className={`text-left px-5 py-3 text-xs font-semibold ${t.muted} uppercase tracking-wide`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id}
                    className={`border-b ${t.divider} ${t.rowHover} cursor-pointer transition-colors`}
                    onClick={() => navigate(`/admin/schools/${user.schoolId}`)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isDark ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>
                          {(user.firstName?.[0] || user.email[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className={`font-semibold text-sm ${t.text}`}>
                            {user.firstName} {user.lastName}
                            {!user.isActive && <span className={`ml-2 text-xs ${isDark ? 'text-red-400' : 'text-red-500'}`}>(inactive)</span>}
                          </p>
                          <p className={`text-xs ${t.muted}`}>{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <School size={13} className={t.muted} />
                        <span className={`text-sm ${t.text}`}>{user.schoolName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-1">
                        {planBadge(user.planStatus)}
                        {user.plan && <p className={`text-xs ${t.muted} capitalize`}>{PLAN_DEFINITIONS.find(p => p.id === user.plan)?.name || user.plan}</p>}
                      </div>
                    </td>
                    <td className={`px-5 py-3.5 text-xs ${t.muted}`}>
                      {user.endsAt ? new Date(user.endsAt).toLocaleDateString() : '—'}
                    </td>
                    <td className={`px-5 py-3.5 text-xs ${t.muted}`}>
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <ChevronRight size={16} className={t.muted} />
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} className={`px-5 py-12 text-center text-sm ${t.muted}`}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
