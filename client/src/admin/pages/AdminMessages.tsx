import { useState, useEffect } from 'react';
import { MessageSquare, Send, School, Users, Check, X, ChevronDown, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminTheme } from '../AdminThemeContext';

interface SchoolOption { schoolId: string; schoolName: string; email: string; }
interface SentMessage {
  id: string;
  title: string;
  body: string;
  targetSchools: string[];
  sentAt: string;
  sentBy: string;
}

export default function AdminMessages() {
  const { isDark, t } = useAdminTheme();
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');

  useEffect(() => { loadSchools(); loadSentMessages(); }, []);

  async function loadSchools() {
    if (!supabase) return;
    setLoadingSchools(true);
    try {
      const [usersRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, school_id, email'),
        supabase.from('settings').select('school_id, value').eq('key', 'schoolName'),
      ]);
      const names: Record<string, string> = {};
      (settingsRes.data || []).forEach((s: any) => { if (s.school_id) names[s.school_id] = s.value; });
      const seen = new Set<string>();
      const list: SchoolOption[] = [];
      (usersRes.data || []).forEach((u: any) => {
        const sid = u.school_id || u.id;
        if (!seen.has(sid)) {
          seen.add(sid);
          list.push({ schoolId: sid, schoolName: names[sid] || 'Unnamed School', email: u.email || '' });
        }
      });
      setSchools(list.sort((a, b) => a.schoolName.localeCompare(b.schoolName)));
    } finally { setLoadingSchools(false); }
  }

  async function loadSentMessages() {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('admin_messages')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(20);
      if (data) {
        setSentMessages(data.map((m: any) => ({
          id: m.id,
          title: m.title,
          body: m.body,
          targetSchools: m.target_schools || [],
          sentAt: m.sent_at,
          sentBy: m.sent_by || 'Admin',
        })));
      }
    } catch { /* table may not exist yet */ }
  }

  function toggleSchool(id: string) {
    setSelectedSchools(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function handleSelectAll() {
    if (selectAll) {
      setSelectedSchools(new Set());
      setSelectAll(false);
    } else {
      setSelectedSchools(new Set(schools.map(s => s.schoolId)));
      setSelectAll(true);
    }
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) { setError('Title and message are required'); return; }
    if (selectedSchools.size === 0) { setError('Select at least one school'); return; }
    if (!supabase) { setError('Supabase not configured'); return; }
    setSending(true); setError('');
    try {
      const targets = Array.from(selectedSchools);
      const now = new Date().toISOString();

      // Insert notifications for each target school
      const notifications = targets.map(schoolId => ({
        id: crypto.randomUUID(),
        school_id: schoolId,
        title,
        message: body,
        type: 'info',
        read: 0,
        created_at: now,
        updated_at: now,
        link: null,
      }));

      const { error: notifError } = await supabase.from('notifications').insert(notifications);
      if (notifError) throw notifError;

      // Log the sent message (best-effort — table may not exist)
      try {
        await supabase.from('admin_messages').insert({
          id: crypto.randomUUID(),
          title,
          body,
          target_schools: targets,
          sent_at: now,
          sent_by: 'Super Admin',
        });
      } catch { /* ignore if table doesn't exist */ }

      setSent(true);
      setTitle(''); setBody(''); setSelectedSchools(new Set()); setSelectAll(false);
      setTimeout(() => setSent(false), 3000);
      loadSentMessages();
    } catch (e: any) {
      setError(e.message || 'Failed to send message');
    } finally { setSending(false); }
  }

  const filteredSchools = schools.filter(s =>
    s.schoolName.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(schoolSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className={`text-2xl font-bold ${t.text}`}>Broadcast Messages</h1>
        <p className={`text-sm ${t.muted} mt-1`}>Send notifications to selected schools. Messages appear in their Notifications panel.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compose */}
        <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl p-5 space-y-4`}>
          <h2 className={`font-bold ${t.text} flex items-center gap-2`}><MessageSquare size={18} className="text-indigo-400" /> Compose Message</h2>

          {/* School selector */}
          <div>
            <label className={`text-xs font-bold uppercase tracking-wider ${t.muted} block mb-1.5`}>Recipients</label>
            <button
              onClick={() => setShowSchoolPicker(v => !v)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${isDark ? 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}
            >
              <span className="flex items-center gap-2">
                <School size={15} className="text-indigo-400" />
                {selectedSchools.size === 0 ? 'Select schools...' : selectedSchools.size === schools.length ? 'All schools' : `${selectedSchools.size} school${selectedSchools.size > 1 ? 's' : ''} selected`}
              </span>
              <ChevronDown size={14} className={`transition-transform ${showSchoolPicker ? 'rotate-180' : ''}`} />
            </button>

            {showSchoolPicker && (
              <div className={`mt-1 rounded-xl border overflow-hidden ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200 shadow-lg'}`}>
                <div className={`p-2 border-b ${isDark ? 'border-slate-600' : 'border-slate-100'}`}>
                  <input
                    type="text"
                    value={schoolSearch}
                    onChange={e => setSchoolSearch(e.target.value)}
                    placeholder="Search schools..."
                    className={`w-full px-3 py-1.5 rounded-lg text-sm border ${isDark ? 'bg-slate-600 border-slate-500 text-white placeholder-slate-400' : 'bg-slate-50 border-slate-200 text-slate-700'} focus:outline-none`}
                  />
                </div>
                <div className={`p-1.5 border-b ${isDark ? 'border-slate-600' : 'border-slate-100'}`}>
                  <button onClick={handleSelectAll} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${isDark ? 'text-indigo-300 hover:bg-slate-600' : 'text-indigo-600 hover:bg-indigo-50'}`}>
                    <Users size={13} /> {selectAll ? 'Deselect All' : 'Select All Schools'}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredSchools.map(s => (
                    <button key={s.schoolId} onClick={() => toggleSchool(s.schoolId)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${isDark ? 'hover:bg-slate-600' : 'hover:bg-slate-50'}`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selectedSchools.has(s.schoolId) ? 'bg-indigo-600 border-indigo-600' : isDark ? 'border-slate-500' : 'border-slate-300'}`}>
                        {selectedSchools.has(s.schoolId) && <Check size={10} className="text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-medium truncate ${t.text}`}>{s.schoolName}</p>
                        <p className={`text-xs truncate ${t.muted}`}>{s.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className={`text-xs font-bold uppercase tracking-wider ${t.muted} block mb-1.5`}>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. System Maintenance Notice"
              className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-slate-200 text-slate-800'}`}
            />
          </div>

          {/* Body */}
          <div>
            <label className={`text-xs font-bold uppercase tracking-wider ${t.muted} block mb-1.5`}>Message *</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message here..."
              rows={5}
              className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-slate-200 text-slate-800'}`}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim() || selectedSchools.size === 0}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
          >
            {sent ? <><Check size={18} /> Sent!</> : sending ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending...</> : <><Send size={18} /> Send to {selectedSchools.size || '...'} School{selectedSchools.size !== 1 ? 's' : ''}</>}
          </button>
        </div>

        {/* Sent history */}
        <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-bold ${t.text} flex items-center gap-2`}><RefreshCw size={16} className="text-emerald-400" /> Recent Broadcasts</h2>
            <button onClick={loadSentMessages} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
              <RefreshCw size={14} className={t.muted} />
            </button>
          </div>
          {sentMessages.length === 0 ? (
            <div className={`text-center py-12 ${t.muted}`}>
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No messages sent yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sentMessages.map(m => (
                <div key={m.id} className={`p-3 rounded-xl border ${isDark ? 'border-slate-700 bg-slate-700/50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`font-semibold text-sm ${t.text} truncate`}>{m.title}</p>
                    <span className={`text-xs shrink-0 ${t.muted}`}>{new Date(m.sentAt).toLocaleDateString()}</span>
                  </div>
                  <p className={`text-xs ${t.muted} mt-1 line-clamp-2`}>{m.body}</p>
                  <p className={`text-xs mt-1.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    {m.targetSchools.length === schools.length ? 'All schools' : `${m.targetSchools.length} school${m.targetSchools.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
