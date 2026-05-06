import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, CheckCircle, XCircle, School, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
        if (!schoolSubMap[sid] || new Date(sub.updated_at) > new Date(schoolSubMap[sid].updated_at)) {
          schoolSubMap[sid] = sub;
        }
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
          id: u.id,
          schoolId: sid,
          schoolName: schoolNames[sid] || 'Unnamed School',
          email: u.email,
          firstName: u.first_name || '',
          lastName: u.last_name || '',
          isActive: u.is_active,
          createdAt: u.created_at,
          planStatus,
          plan: sub?.plan || null,
        };
      });

      setUsers(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.schoolName.toLowerCase().includes(search.toLowerCase()) ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const planBadge = (status: UserRow['planStatus']) => {
    if (status === 'active') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400"><CheckCircle size={10} />Active</span>;
    if (status === 'expired') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400"><XCircle size={10} />Expired</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">No Plan</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-slate-400 text-sm mt-1">{users.length} registered users</p>
        </div>
        <button
          onClick={loadUsers}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-all"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email, name, or school..."
          className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">User</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">School</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">Plan Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">Joined</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => navigate(`/admin/schools/${user.schoolId}`)}
                  >
                    <td className="px-5 py-3">
                      <div>
                        <p className="text-white font-medium text-sm">
                          {user.firstName} {user.lastName}
                          {!user.isActive && <span className="ml-2 text-xs text-red-400">(inactive)</span>}
                        </p>
                        <p className="text-slate-500 text-xs">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <School size={13} className="text-slate-500" />
                        <span className="text-slate-300 text-sm">{user.schoolName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">{planBadge(user.planStatus)}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <ChevronRight size={16} className="text-slate-600" />
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-500 text-sm">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
