import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CheckCircle, XCircle, Clock, ChevronRight, RefreshCw, School } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PLAN_DEFINITIONS } from '../../utils/plans';
import { useAdminTheme } from '../AdminThemeContext';

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
  const { isDark, t } = useAdminTheme();
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
        if (s.school_id && s.status !== 'completed')
          schoolStudentCount[s.school_id] = (schoolStudentCount[s.school_id] || 0) + 1;
      });

      const schoolSubMap: Record<string, any> = {};
      subs.forEach((sub: any) => {
        const sid = sub.school_id;
        if (!sid) return;
        if (!schoolSubMap[sid] || new Date(sub.updated_at) > new Date(schoolSubMap[sid].updated_at)) schoolSubMap[sid] = sub;
      });

      const uniqueSchools = [...new Set(users.map((u: any) => u.school_id || u.id).filter(Boolean))];
      const now = Date.now();

      const rows: SchoolRow[] = uniqueSchools.map(sid => {
        const sub = schoolSubMap[sid];
        let status: SchoolRow['status'] = 'no_plan';
        let endsAt: string | null = null;
        let plan: string | null = null;
        if (sub) {
          plan = sub.plan; endsAt = sub.ends_at;
          status = endsAt && new Date(endsAt).getTime() > now ? 'active' : 'expired';
        }
        return { schoolId: sid, schoolName: schoolNames[sid] || 'Unnamed School', email: schoolEmails[sid] || '—', plan, status, endsAt, studentCount: schoolStudentCount[sid] || 0, userCount: schoolUserCount[sid] || 0, createdAt: schoolCreated[sid] || '' };
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
    const q = search.toLowerCase();
    const matchSearch = s.schoolName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.schoolId.toLowerCase().includes(q);
    return matchSearch && (filter === 'all' || s.status === filter);
  });

  const statusBadge = (status: SchoolRow['status']) => {
    if (status === 'active') return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${t.badge('green')}`}><CheckCircle size={10} />Active</span>;
    if (status === 'expired') return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${t.badge('red')}`}><XCircle size={10} />Expired</span>;
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${t.badge('amber')}`}><Clock size={10} />No Plan</span>;
  };

  const filterCounts = {
    all: schools.length,
    active: schools.filter(s => s.status === 'active').length,
    expired: schools.filter(s => s.status === 'expired').length,
    no_plan: schools.filter(s => s.status === 'no_plan').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${t.text}`}>Schools</h1>
          <p className={`text-sm mt-0.5 ${t.muted}`}>{schools.length} registered schools</p>
        </div>
        <button onClick={loadSchools} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'}`}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className={`rounded-xl p-4 text-sm ${isDark ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>{error}</div>}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.muted}`} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search schools..."
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
                {filterCounts[f]}
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
                  {['School', 'Plan', 'Status', 'Expires', 'Students', ''].map(h => (
                    <th key={h} className={`text-left px-5 py-3 text-xs font-semibold ${t.muted} uppercase tracking-wide`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(school => (
                  <tr key={school.schoolId}
                    className={`border-b ${t.divider} ${t.rowHover} cursor-pointer transition-colors`}
                    onClick={() => navigate(`/admin/schools/${school.schoolId}`)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-indigo-900/50' : 'bg-indigo-100'}`}>
                          <School size={15} className={isDark ? 'text-indigo-400' : 'text-indigo-600'} />
                        </div>
                        <div>
                          <p className={`font-semibold text-sm ${t.text}`}>{school.schoolName}</p>
                          <p className={`text-xs ${t.muted}`}>{school.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`px-5 py-3.5 text-sm ${t.muted} capitalize`}>
                      {PLAN_DEFINITIONS.find(p => p.id === school.plan)?.name || school.plan || '—'}
                    </td>
                    <td className="px-5 py-3.5">{statusBadge(school.status)}</td>
                    <td className={`px-5 py-3.5 text-xs ${t.muted}`}>
                      {school.endsAt ? new Date(school.endsAt).toLocaleDateString() : '—'}
                    </td>
                    <td className={`px-5 py-3.5 text-sm font-medium ${t.text}`}>{school.studentCount}</td>
                    <td className="px-5 py-3.5">
                      <ChevronRight size={16} className={t.muted} />
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={6} className={`px-5 py-12 text-center text-sm ${t.muted}`}>No schools found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
