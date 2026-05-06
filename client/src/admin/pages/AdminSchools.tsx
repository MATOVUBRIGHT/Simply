import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, CheckCircle, XCircle, Clock, ChevronRight, RefreshCw, School,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PLAN_DEFINITIONS } from '../../utils/plans';

interface SchoolRow {
  schoolId: string;
  schoolName: string;
  email: string;
  plan: string | null;
  status: 'active' | 'expired' | 'no_plan';
  endsAt: string | null;
  studentCount: number;
  userCount: number;
  createdAt: string;
}

export default function AdminSchools() {
  const navigate = useNavigate();
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'expired' | 'no_plan'>('all');
  const [error, setError] = useState('');

  useEffect(() => { loadSchools(); }, []);

  async function loadSchools() {
    if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }
    setLoading(true);
    try {
      const [usersRes, subsRes, studentsRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, school_id, email, created_at'),
        supabase.from('subscriptions').select('school_id, plan, ends_at, updated_at').order('updated_at', { ascending: false }),
        supabase.from('students').select('school_id, status'),
        supabase.from('settings').select('school_id, key, value').eq('key', 'schoolName'),
      ]);

      const users = usersRes.data || [];
      const subs = subsRes.data || [];
      const students = studentsRes.data || [];
      const settings = settingsRes.data || [];

      const schoolNames: Record<string, string> = {};
      settings.forEach((s: any) => { if (s.school_id && s.value) schoolNames[s.school_id] = String(s.value); });

      const schoolEmails: Record<string, string> = {};
      const schoolCreated: Record<string, string> = {};
      const schoolUserCount: Record<string, number> = {};
      users.forEach((u: any) => {
        const sid = u.school_id || u.id;
        if (!schoolEmails[sid]) schoolEmails[sid] = u.email;
        if (!schoolCreated[sid]) schoolCreated[sid] = u.created_at;
        schoolUserCount[sid] = (schoolUserCount[sid] || 0) + 1;
      });

      const schoolStudentCount: Record<string, number> = {};
      students.forEach((s: any) => {
        if (s.school_id && s.status !== 'completed') {
          schoolStudentCount[s.school_id] = (schoolStudentCount[s.school_id] || 0) + 1;
        }
      });

      // Latest sub per school
      const schoolSubMap: Record<string, any> = {};
      subs.forEach((sub: any) => {
        const sid = sub.school_id;
        if (!sid) return;
        if (!schoolSubMap[sid] || new Date(sub.updated_at) > new Date(schoolSubMap[sid].updated_at)) {
          schoolSubMap[sid] = sub;
        }
      });

      const uniqueSchools = [...new Set(users.map((u: any) => u.school_id || u.id).filter(Boolean))];
      const now = Date.now();

      const rows: SchoolRow[] = uniqueSchools.map(sid => {
        const sub = schoolSubMap[sid];
        let status: SchoolRow['status'] = 'no_plan';
        let endsAt: string | null = null;
        let plan: string | null = null;

        if (sub) {
          plan = sub.plan;
          endsAt = sub.ends_at;
          const ends = endsAt ? new Date(endsAt).getTime() : 0;
          status = ends > now ? 'active' : 'expired';
        }

        return {
          schoolId: sid,
          schoolName: schoolNames[sid] || 'Unnamed School',
          email: schoolEmails[sid] || '—',
          plan,
          status,
          endsAt,
          studentCount: schoolStudentCount[sid] || 0,
          userCount: schoolUserCount[sid] || 0,
          createdAt: schoolCreated[sid] || '',
        };
      });

      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSchools(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load schools');
    } finally {
      setLoading(false);
    }
  }

  const filtered = schools.filter(s => {
    const matchSearch =
      s.schoolName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      s.schoolId.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || s.status === filter;
    return matchSearch && matchFilter;
  });

  const statusBadge = (status: SchoolRow['status']) => {
    if (status === 'active') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400"><CheckCircle size={10} />Active</span>;
    if (status === 'expired') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400"><XCircle size={10} />Expired</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/40 text-amber-400"><Clock size={10} />No Plan</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Schools</h1>
          <p className="text-slate-400 text-sm mt-1">{schools.length} registered schools</p>
        </div>
        <button
          onClick={loadSchools}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-all"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search schools..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'expired', 'no_plan'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {f === 'no_plan' ? 'No Plan' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
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
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">School</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">Expires</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400">Students</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-slate-400"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(school => (
                  <tr
                    key={school.schoolId}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => navigate(`/admin/schools/${school.schoolId}`)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-900/50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <School size={14} className="text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{school.schoolName}</p>
                          <p className="text-slate-500 text-xs">{school.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-300 text-sm capitalize">
                      {PLAN_DEFINITIONS.find(p => p.id === school.plan)?.name || school.plan || '—'}
                    </td>
                    <td className="px-5 py-3">{statusBadge(school.status)}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {school.endsAt ? new Date(school.endsAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-300 text-sm">{school.studentCount}</td>
                    <td className="px-5 py-3">
                      <ChevronRight size={16} className="text-slate-600" />
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-500 text-sm">
                      No schools found
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
