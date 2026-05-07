import { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, AlertTriangle, XCircle, Info, CheckCircle, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminTheme } from '../AdminThemeContext';

interface SecurityEvent {
  id: string;
  schoolId: string;
  schoolName: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

interface SchoolSecuritySummary {
  schoolId: string;
  schoolName: string;
  email: string;
  errors: number;
  warnings: number;
  lastEvent: string | null;
  events: SecurityEvent[];
  expanded: boolean;
}

export default function AdminSecurity() {
  const { theme } = useAdminTheme();
  const isDark = theme === 'dark';
  const [summaries, setSummaries] = useState<SchoolSecuritySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings'>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const [notifRes, settingsRes, usersRes] = await Promise.all([
        // Notifications with type error/warning are security/error events
        supabase.from('notifications')
          .select('id, school_id, title, message, type, read, created_at')
          .in('type', ['error', 'warning', 'info'])
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('settings').select('school_id, key, value').eq('key', 'schoolName'),
        supabase.from('users').select('school_id, email'),
      ]);

      const notifs = notifRes.data || [];
      const settings = settingsRes.data || [];
      const users = usersRes.data || [];

      const schoolNames: Record<string, string> = {};
      settings.forEach((s: any) => { if (s.school_id && s.value) schoolNames[s.school_id] = String(s.value); });

      const schoolEmails: Record<string, string> = {};
      users.forEach((u: any) => { if (!schoolEmails[u.school_id]) schoolEmails[u.school_id] = u.email; });

      // Group by school
      const schoolMap: Record<string, SchoolSecuritySummary> = {};
      notifs.forEach((n: any) => {
        const sid = n.school_id;
        if (!sid) return;
        if (!schoolMap[sid]) {
          schoolMap[sid] = {
            schoolId: sid,
            schoolName: schoolNames[sid] || 'Unnamed School',
            email: schoolEmails[sid] || '—',
            errors: 0, warnings: 0,
            lastEvent: null,
            events: [],
            expanded: false,
          };
        }
        const s = schoolMap[sid];
        if (n.type === 'error') s.errors++;
        if (n.type === 'warning') s.warnings++;
        if (!s.lastEvent || new Date(n.created_at) > new Date(s.lastEvent)) s.lastEvent = n.created_at;
        s.events.push({
          id: n.id, schoolId: sid,
          schoolName: schoolNames[sid] || 'Unnamed',
          type: n.type as 'error' | 'warning' | 'info',
          title: n.title || 'Event',
          message: n.message || '',
          createdAt: n.created_at,
          read: n.read,
        });
      });

      // Also add schools with no events but that exist (for completeness)
      const allSchools = [...new Set(users.map((u: any) => u.school_id || u.id).filter(Boolean))];
      allSchools.forEach(sid => {
        if (!schoolMap[sid]) {
          schoolMap[sid] = {
            schoolId: sid,
            schoolName: schoolNames[sid] || 'Unnamed School',
            email: schoolEmails[sid] || '—',
            errors: 0, warnings: 0,
            lastEvent: null,
            events: [],
            expanded: false,
          };
        }
      });

      const list = Object.values(schoolMap).sort((a, b) => {
        // Sort by most errors first, then warnings
        if (b.errors !== a.errors) return b.errors - a.errors;
        return b.warnings - a.warnings;
      });

      setSummaries(list);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(schoolId: string) {
    setSummaries(prev => prev.map(s => s.schoolId === schoolId ? { ...s, expanded: !s.expanded } : s));
  }

  const filtered = summaries.filter(s => {
    if (filter === 'errors') return s.errors > 0;
    if (filter === 'warnings') return s.warnings > 0;
    return true;
  });

  const totalErrors = summaries.reduce((sum, s) => sum + s.errors, 0);
  const totalWarnings = summaries.reduce((sum, s) => sum + s.warnings, 0);
  const schoolsWithIssues = summaries.filter(s => s.errors > 0 || s.warnings > 0).length;

  // Theme
  const card = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const divider = isDark ? 'border-slate-800' : 'border-slate-200';
  const rowBg = isDark ? 'bg-slate-800/30' : 'bg-slate-50';
  const expandedBg = isDark ? 'bg-slate-800/50' : 'bg-slate-50/80';

  function eventIcon(type: string) {
    if (type === 'error') return <XCircle size={14} className="text-red-400 flex-shrink-0" />;
    if (type === 'warning') return <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />;
    return <Info size={14} className="text-blue-400 flex-shrink-0" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>Security & Errors</h1>
          <p className={`text-sm mt-1 ${textMuted}`}>Error logs and security events per school</p>
        </div>
        <button onClick={load} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`${card} border rounded-xl p-4`}>
          <div className="w-9 h-9 bg-red-900/40 rounded-xl flex items-center justify-center mb-3">
            <XCircle size={18} className="text-red-400" />
          </div>
          <p className={`text-2xl font-bold ${textPrimary}`}>{totalErrors}</p>
          <p className={`text-xs ${textMuted} mt-0.5`}>Total Errors</p>
        </div>
        <div className={`${card} border rounded-xl p-4`}>
          <div className="w-9 h-9 bg-amber-900/40 rounded-xl flex items-center justify-center mb-3">
            <AlertTriangle size={18} className="text-amber-400" />
          </div>
          <p className={`text-2xl font-bold ${textPrimary}`}>{totalWarnings}</p>
          <p className={`text-xs ${textMuted} mt-0.5`}>Total Warnings</p>
        </div>
        <div className={`${card} border rounded-xl p-4`}>
          <div className="w-9 h-9 bg-indigo-900/40 rounded-xl flex items-center justify-center mb-3">
            <ShieldAlert size={18} className="text-indigo-400" />
          </div>
          <p className={`text-2xl font-bold ${textPrimary}`}>{schoolsWithIssues}</p>
          <p className={`text-xs ${textMuted} mt-0.5`}>Schools with Issues</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'errors', 'warnings'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filter === f
              ? f === 'errors' ? 'bg-red-600 text-white'
                : f === 'warnings' ? 'bg-amber-500 text-white'
                : 'bg-indigo-600 text-white'
              : isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* School list */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(school => (
            <div key={school.schoolId} className={`${card} border rounded-xl overflow-hidden`}>
              {/* School row */}
              <button
                onClick={() => toggleExpand(school.schoolId)}
                className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium text-sm ${textPrimary}`}>{school.schoolName}</p>
                    {school.errors > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400">
                        <XCircle size={10} />{school.errors} error{school.errors !== 1 ? 's' : ''}
                      </span>
                    )}
                    {school.warnings > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/40 text-amber-400">
                        <AlertTriangle size={10} />{school.warnings} warning{school.warnings !== 1 ? 's' : ''}
                      </span>
                    )}
                    {school.errors === 0 && school.warnings === 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400">
                        <CheckCircle size={10} />Clean
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${textMuted} mt-0.5`}>
                    {school.email}
                    {school.lastEvent && <span className="ml-2">· Last event: {new Date(school.lastEvent).toLocaleDateString()}</span>}
                  </p>
                </div>
                <div className={`flex items-center gap-2 ${textMuted}`}>
                  <Eye size={14} />
                  <span className="text-xs">{school.events.length}</span>
                  {school.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {/* Expanded events */}
              {school.expanded && school.events.length > 0 && (
                <div className={`border-t ${divider} ${expandedBg}`}>
                  <div className="max-h-64 overflow-y-auto">
                    {school.events.map(ev => (
                      <div key={ev.id} className={`flex items-start gap-3 px-5 py-3 border-b ${divider} last:border-0`}>
                        {eventIcon(ev.type)}
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${textPrimary}`}>{ev.title}</p>
                          {ev.message && <p className={`text-xs ${textMuted} mt-0.5 line-clamp-2`}>{ev.message}</p>}
                        </div>
                        <span className={`text-xs ${textMuted} flex-shrink-0`}>
                          {new Date(ev.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {school.expanded && school.events.length === 0 && (
                <div className={`border-t ${divider} px-5 py-4 text-center text-sm ${textMuted}`}>
                  No events recorded for this school
                </div>
              )}
            </div>
          ))}

          {!filtered.length && (
            <div className={`${card} border rounded-xl px-5 py-12 text-center text-sm ${textMuted}`}>
              No issues found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
