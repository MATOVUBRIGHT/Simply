import { useState, useEffect } from 'react';
import { MessageSquare, Send, School, Users, Check, CheckCheck, X, ChevronDown, RefreshCw, Trash2, Reply, Link as LinkIcon, Image, Paperclip, Circle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminTheme } from '../AdminThemeContext';
import { buildAdminMessageLink, normalizeExternalUrl } from '../../utils/adminMessageLinks';
import { downloadAttachment, openExternalLink } from '../../utils/externalActions';
import { matchesTextSearch } from '../../utils/searchMatch';
import { useConfirm } from '../../components/ConfirmModal';

interface SchoolOption { schoolId: string; schoolName: string; email: string; lastSeenAt?: string; online: boolean; }
interface SentMessage {
  id: string;
  title: string;
  body: string;
  targetSchools: string[];
  sentAt: string;
  sentBy: string;
  allowReply: boolean;
  actionUrl: string;
  imageUrl: string;
  attachmentUrl: string;
  attachmentName: string;
  attachmentType: string;
  attachmentSize: number;
}
interface MessageReply {
  id: string;
  parentId: string;
  schoolId: string;
  schoolName: string;
  body: string;
  sentAt: string;
}
type ChatTimelineItem =
  | { kind: 'sent'; sentAt: string; message: SentMessage }
  | { kind: 'reply'; sentAt: string; reply: MessageReply };

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export default function AdminMessages() {
  const { isDark, t } = useAdminTheme();
  const confirm = useConfirm();
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [allowReplies, setAllowReplies] = useState(true);
  const [actionUrl, setActionUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentType, setAttachmentType] = useState('');
  const [attachmentSize, setAttachmentSize] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [replies, setReplies] = useState<MessageReply[]>([]);
  const [clearing, setClearing] = useState(false);
  const [messageReceipts, setMessageReceipts] = useState<Record<string, Record<string, boolean>>>({});
  const [selectedChatSchoolId, setSelectedChatSchoolId] = useState('');

  useEffect(() => { loadSchools(); loadSentMessages(); loadReplies(); }, []);
  useEffect(() => { void loadMessageReceipts(sentMessages); }, [sentMessages]);

  async function insertAdminMessage(payload: Record<string, any>) {
    if (!supabase) return;
    const { error: fullError } = await supabase.from('admin_messages').insert(payload);
    if (!fullError) return;

    const message = String(fullError.message || '').toLowerCase();
    const missingOptionalColumn =
      message.includes('allow_reply') ||
      message.includes('action_url') ||
      message.includes('image_url') ||
      message.includes('attachment_url') ||
      message.includes('attachment_name') ||
      message.includes('attachment_type') ||
      message.includes('attachment_size') ||
      message.includes('schema cache');

    if (!missingOptionalColumn) throw fullError;

    const { allow_reply, action_url, image_url, attachment_url, attachment_name, attachment_type, attachment_size, ...legacyPayload } = payload;
    void allow_reply; void action_url; void image_url; void attachment_url; void attachment_name; void attachment_type; void attachment_size;
    const { error: legacyError } = await supabase.from('admin_messages').insert(legacyPayload);
    if (legacyError) throw legacyError;
  }

  async function loadSchools() {
    if (!supabase) return;
    setLoadingSchools(true);
    try {
      const [usersRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, school_id, email'),
        supabase.from('settings').select('school_id, key, value, updated_at').in('key', ['schoolName', 'lastSeenAt', 'lastLoginAt']),
      ]);
      const names: Record<string, string> = {};
      const seenTimes: Record<string, string> = {};
      (settingsRes.data || []).forEach((s: any) => {
        if (!s.school_id) return;
        if (s.key === 'schoolName') names[s.school_id] = String(s.value || '');
        if (s.key === 'lastSeenAt' || s.key === 'lastLoginAt') {
          const value = String(s.value || s.updated_at || '');
          if (!seenTimes[s.school_id] || new Date(value).getTime() > new Date(seenTimes[s.school_id]).getTime()) {
            seenTimes[s.school_id] = value;
          }
        }
      });
      const seen = new Set<string>();
      const list: SchoolOption[] = [];
      (usersRes.data || []).forEach((u: any) => {
        const sid = u.school_id || u.id;
        if (!seen.has(sid)) {
          seen.add(sid);
          const lastSeenAt = seenTimes[sid];
          const online = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() <= 2 * 60_000 : false;
          list.push({ schoolId: sid, schoolName: names[sid] || 'Unnamed School', email: u.email || '', lastSeenAt, online });
        }
      });
      setSchools(list.sort((a, b) => a.schoolName.localeCompare(b.schoolName)));
      setSelectedChatSchoolId(prev => prev || list[0]?.schoolId || '');
    } finally { setLoadingSchools(false); }
  }

  async function loadMessageReceipts(messages: SentMessage[]) {
    if (!supabase || messages.length === 0) {
      setMessageReceipts({});
      return;
    }
    try {
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString();
      const { data } = await supabase
        .from('notifications')
        .select('school_id, link, read, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(2000);
      const next: Record<string, Record<string, boolean>> = {};
      messages.forEach(message => { next[message.id] = {}; });
      (data || []).forEach((notification: any) => {
        const link = String(notification.link || '');
        const schoolId = String(notification.school_id || '');
        const message = messages.find(item => item.id && link.includes(item.id));
        if (!message || !schoolId) return;
        next[message.id] = next[message.id] || {};
        next[message.id][schoolId] = Boolean(notification.read) || next[message.id][schoolId] || false;
      });
      setMessageReceipts(next);
    } catch {
      setMessageReceipts({});
    }
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
          allowReply: m.allow_reply !== false,
          actionUrl: m.action_url || '',
          imageUrl: m.image_url || '',
          attachmentUrl: m.attachment_url || '',
          attachmentName: m.attachment_name || 'attachment',
          attachmentType: m.attachment_type || '',
          attachmentSize: Number(m.attachment_size || 0),
        })).filter((m: SentMessage) => m.title && (m.targetSchools.length > 0 || m.sentBy === 'Schofy assistant' || m.sentBy === 'Super Admin')));
      }
    } catch { /* table may not exist yet */ }
  }

  async function loadReplies() {
    if (!supabase) return;
    try {
      const { data } = await supabase
        .from('admin_messages')
        .select('*')
        .eq('direction', 'reply')
        .order('sent_at', { ascending: false })
        .limit(100);
      setReplies((data || []).map((m: any) => ({
        id: m.id,
        parentId: m.parent_id || '',
        schoolId: m.school_id || '',
        schoolName: m.school_name || 'School',
        body: m.body || '',
        sentAt: m.sent_at,
      })));
    } catch {
      setReplies([]);
    }
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

  function clearAttachment() {
    setAttachmentUrl('');
    setAttachmentName('');
    setAttachmentType('');
    setAttachmentSize(0);
  }

  async function handleAttachmentFile(file?: File | null) {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('Attachment is too large. Please attach a file up to 4 MB.');
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    setAttachmentUrl(dataUrl);
    setAttachmentName(file.name);
    setAttachmentType(file.type || 'application/octet-stream');
    setAttachmentSize(file.size);
    setError('');
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) { setError('Title and message are required'); return; }
    if (selectedSchools.size === 0) { setError('Select at least one school'); return; }
    if (!supabase) { setError('Cloud space is not configured'); return; }
    setSending(true); setError('');
    try {
      const targets = Array.from(selectedSchools);
      const now = new Date().toISOString();
      const messageId = crypto.randomUUID();
      const normalizedActionUrl = normalizeExternalUrl(actionUrl);
      const normalizedImageUrl = normalizeExternalUrl(imageUrl);
      const normalizedAttachmentUrl = attachmentUrl.startsWith('data:') ? attachmentUrl : normalizeExternalUrl(attachmentUrl);
      const notificationLink = buildAdminMessageLink({
        messageId,
        allowReply: allowReplies,
        actionUrl: normalizedActionUrl,
        imageUrl: normalizedImageUrl,
        attachmentUrl: normalizedAttachmentUrl,
        attachmentName,
        attachmentType,
        attachmentSize,
      });

      // Insert notifications for each target school
      const notifications = targets.map(schoolId => ({
        id: crypto.randomUUID(),
        school_id: schoolId,
        title,
        message: body,
        type: 'info',
        read: false,
        created_at: now,
        updated_at: now,
        link: notificationLink,
      }));

      const { error: notifError } = await supabase.from('notifications').insert(notifications);
      if (notifError) throw notifError;

      // Log the sent message (best-effort — table may not exist)
      try {
        await insertAdminMessage({
          id: messageId,
          title,
          body,
          target_schools: targets,
          sent_at: now,
          sent_by: 'Schofy assistant',
          direction: 'broadcast',
          allow_reply: allowReplies,
          action_url: normalizedActionUrl || null,
          image_url: normalizedImageUrl || null,
          attachment_url: normalizedAttachmentUrl || null,
          attachment_name: attachmentName || null,
          attachment_type: attachmentType || null,
          attachment_size: attachmentSize || null,
        });
      } catch (logError: any) {
        console.warn('Broadcast sent, but admin message history failed:', logError?.message || logError);
      }

      setSent(true);
      setTitle(''); setBody(''); setActionUrl(''); setImageUrl(''); clearAttachment(); setAllowReplies(true); setSelectedSchools(new Set()); setSelectAll(false);
      setTimeout(() => setSent(false), 3000);
      loadSentMessages();
      loadReplies();
    } catch (e: any) {
      setError(e.message || 'Failed to send message');
    } finally { setSending(false); }
  }

  async function clearChat() {
    if (!supabase) return;
    const ok = await confirm({
      title: 'Clear Assistant Chat',
      description: 'Clear all broadcast messages and school replies from the Schofy assistant chat?',
      confirmLabel: 'Clear Chat',
      variant: 'danger',
    });
    if (!ok) return;
    setClearing(true);
    try {
      await supabase.from('admin_messages').delete().neq('id', '__never__');
      setSentMessages([]);
      setReplies([]);
    } catch (e: any) {
      setError(e.message || 'Failed to clear chat');
    } finally {
      setClearing(false);
    }
  }

  const filteredSchools = schools.filter(s => matchesTextSearch([s.schoolName, s.email, s.schoolId], schoolSearch));
  const selectedChatSchool = schools.find(school => school.schoolId === selectedChatSchoolId) || schools[0];
  const repliesBySchool = replies.reduce<Record<string, MessageReply[]>>((acc, reply) => {
    const key = reply.schoolId || reply.schoolName || 'unknown';
    acc[key] = acc[key] || [];
    acc[key].push(reply);
    return acc;
  }, {});
  const schoolChats = schools.map(school => {
    const schoolReplies = repliesBySchool[school.schoolId] || [];
    return {
      key: school.schoolId,
      schoolName: school.schoolName,
      online: school.online,
      lastSeenAt: school.lastSeenAt,
      replies: schoolReplies,
      sentMessages: sentMessages.filter(message => message.targetSchools.includes(school.schoolId)),
    };
  }).filter(chat => chat.replies.length > 0 || chat.sentMessages.length > 0);
  const selectedChat = selectedChatSchool
    ? (() => {
        const timeline: ChatTimelineItem[] = [
          ...sentMessages
            .filter(message => message.targetSchools.includes(selectedChatSchool.schoolId))
            .map(message => ({ kind: 'sent' as const, sentAt: message.sentAt, message })),
          ...(repliesBySchool[selectedChatSchool.schoolId] || []).map(reply => ({ kind: 'reply' as const, sentAt: reply.sentAt, reply })),
        ];
        return {
          school: selectedChatSchool,
          messages: timeline.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
        };
      })()
    : null;

  function isReadBySchool(messageId: string, schoolId: string) {
    return Boolean(messageReceipts[messageId]?.[schoolId]);
  }

  function readCount(message: SentMessage) {
    return message.targetSchools.filter(schoolId => isReadBySchool(message.id, schoolId)).length;
  }

  return (
    <div className="w-full max-w-7xl space-y-6 overflow-x-hidden">
      <div>
        <h1 className={`text-2xl font-bold ${t.text}`}>Broadcast Messages</h1>
        <p className={`text-sm ${t.muted} mt-1`}>Send notifications to selected schools. Broadcasts appear as popups and schools can reply here.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,0.85fr)_minmax(420px,1.15fr)] gap-6 items-start">
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
                <span className="min-w-0 truncate">{selectedSchools.size === 0 ? 'Select schools...' : selectedSchools.size === schools.length ? 'All schools' : `${selectedSchools.size} school${selectedSchools.size > 1 ? 's' : ''} selected`}</span>
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
                        <p className={`flex items-center gap-2 font-medium truncate ${t.text}`}>
                          <span className="min-w-0 truncate">{s.schoolName}</span>
                          {s.online && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Online</span>}
                        </p>
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

          <div className={`rounded-xl border p-3 ${isDark ? 'border-slate-700 bg-slate-900/30' : 'border-slate-200 bg-slate-50'}`}>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className={`font-semibold ${t.text}`}>Allow schools to reply</span>
              <button
                type="button"
                onClick={() => setAllowReplies(v => !v)}
                className={`relative h-6 w-11 rounded-full transition-colors ${allowReplies ? 'bg-indigo-600' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${allowReplies ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </label>
            <p className={`mt-1 text-xs ${t.muted}`}>{allowReplies ? 'Recipients can reply back to this broadcast.' : 'Reply buttons will be hidden for this broadcast.'}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className={`mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${t.muted}`}><LinkIcon size={13} /> Link</span>
              <input
                type="url"
                value={actionUrl}
                onChange={e => setActionUrl(e.target.value)}
                placeholder="Release/download link"
                className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-slate-200 text-slate-800'}`}
              />
            </label>
            <label className="block">
              <span className={`mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${t.muted}`}><Image size={13} /> Image</span>
              <input
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="Optional image URL"
                className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-slate-200 text-slate-800'}`}
              />
            </label>
            <label className="block">
              <span className={`mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${t.muted}`}><Paperclip size={13} /> Attachment</span>
              <input
                type="file"
                onChange={e => void handleAttachmentFile(e.target.files?.[0])}
                className={`w-full rounded-xl border text-sm file:mr-3 file:border-0 file:px-3 file:py-2.5 file:text-sm file:font-semibold ${isDark ? 'bg-slate-700 border-slate-600 text-white file:bg-slate-600 file:text-white' : 'bg-white border-slate-200 text-slate-800 file:bg-indigo-50 file:text-indigo-700'}`}
              />
              {attachmentUrl && (
                <div className={`mt-2 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${isDark ? 'border-slate-700 bg-slate-900/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <span className="min-w-0 truncate">{attachmentName} ({Math.max(1, Math.ceil(attachmentSize / 1024))} KB)</span>
                  <button type="button" onClick={clearAttachment} className="font-semibold text-red-500 hover:text-red-600">Remove</button>
                </div>
              )}
            </label>
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
            <div className="flex items-center gap-1">
              <button onClick={() => { loadSentMessages(); loadReplies(); }} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <RefreshCw size={14} className={t.muted} />
              </button>
              <button onClick={clearChat} disabled={clearing} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-red-900/30 text-red-300' : 'hover:bg-red-50 text-red-600'} disabled:opacity-60`} title="Clear chat">
                <Trash2 size={14} />
              </button>
            </div>
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
                    <p className={`min-w-0 break-words font-semibold text-sm ${t.text}`}>{m.title}</p>
                    <span className={`text-xs shrink-0 ${t.muted}`}>{new Date(m.sentAt).toLocaleDateString()}</span>
                  </div>
                  <p className={`text-xs ${t.muted} mt-1 break-words line-clamp-3`}>{m.body}</p>
                  {m.imageUrl && <img src={m.imageUrl} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 ${m.allowReply ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{m.allowReply ? 'Replies on' : 'Replies off'}</span>
                    {m.actionUrl && <button type="button" onClick={() => void openExternalLink(m.actionUrl)} className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700 hover:bg-indigo-200">Open link</button>}
                    {m.attachmentUrl && <button type="button" onClick={() => downloadAttachment(m.attachmentUrl, m.attachmentName)} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 hover:bg-amber-200">{m.attachmentName || 'Attachment'}</button>}
                  </div>
                  <p className={`text-xs mt-1.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
                    {m.targetSchools.length === schools.length ? 'All schools' : `${m.targetSchools.length} school${m.targetSchools.length !== 1 ? 's' : ''}`}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${readCount(m) > 0 ? 'bg-sky-100 text-sky-700' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                      <CheckCheck size={12} className={readCount(m) > 0 ? 'text-sky-600' : ''} />
                      {readCount(m)} / {m.targetSchools.length} read
                    </span>
                    {m.targetSchools.slice(0, 5).map(schoolId => {
                      const school = schools.find(item => item.schoolId === schoolId);
                      const read = isReadBySchool(m.id, schoolId);
                      return (
                        <span key={schoolId} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${read ? 'bg-sky-50 text-sky-700' : isDark ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-500'}`}>
                          <CheckCheck size={11} className={read ? 'text-sky-600' : 'text-slate-400'} />
                          {school?.schoolName || schoolId.slice(0, 6)}
                        </span>
                      );
                    })}
                    {m.targetSchools.length > 5 && <span className={`text-[11px] ${t.muted}`}>+{m.targetSchools.length - 5} more</span>}
                  </div>
                  {replies.filter(r => r.parentId === m.id).length > 0 && (
                    <div className={`mt-3 space-y-2 border-t pt-3 ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
                      {replies.filter(r => r.parentId === m.id).slice(0, 4).map(r => (
                        <div key={r.id} className={`rounded-lg p-2 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                          <p className={`text-xs font-semibold flex items-center gap-1 ${t.text}`}><Reply size={11} /> {r.schoolName}</p>
                          <p className={`text-xs mt-1 ${t.muted}`}>{r.body}</p>
                          <p className={`text-[10px] mt-1 ${t.muted}`}>{new Date(r.sentAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`font-bold ${t.text} flex items-center gap-2`}><School size={16} className="text-blue-400" /> School Chats</h2>
          <span className={`text-xs ${t.muted}`}>{schoolChats.length} active chats</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div className={`max-h-[520px] overflow-y-auto rounded-xl border ${isDark ? 'border-slate-700 bg-slate-900/30' : 'border-slate-100 bg-slate-50'}`}>
            {schools.map(school => {
              const chat = schoolChats.find(item => item.key === school.schoolId);
              const isSelected = selectedChatSchool?.schoolId === school.schoolId;
              return (
                <button
                  key={school.schoolId}
                  type="button"
                  onClick={() => setSelectedChatSchoolId(school.schoolId)}
                  className={`w-full border-b px-3 py-3 text-left last:border-b-0 ${isDark ? 'border-slate-800 hover:bg-slate-800' : 'border-slate-100 hover:bg-white'} ${isSelected ? isDark ? 'bg-slate-800' : 'bg-white' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${t.text}`}>{school.schoolName}</p>
                      <p className={`truncate text-xs ${t.muted}`}>{school.email || school.schoolId}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${school.online ? 'bg-emerald-100 text-emerald-700' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                      <Circle size={7} fill="currentColor" />
                      {school.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <p className={`mt-1 text-xs ${t.muted}`}>
                    {(chat?.sentMessages.length || 0)} sent · {(chat?.replies.length || 0)} replies
                  </p>
                </button>
              );
            })}
          </div>

          <div className={`flex min-h-[420px] flex-col rounded-xl border ${isDark ? 'border-slate-700 bg-slate-900/30' : 'border-slate-100 bg-slate-50'}`}>
            {selectedChat && selectedChat.school ? (
              <>
                <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                  <div className="min-w-0">
                    <p className={`truncate font-bold ${t.text}`}>{selectedChat.school.schoolName}</p>
                    <p className={`text-xs ${t.muted}`}>
                      {selectedChat.school.online ? 'Online now' : selectedChat.school.lastSeenAt ? `Last seen ${new Date(selectedChat.school.lastSeenAt).toLocaleString()}` : 'No recent activity'}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${selectedChat.school.online ? 'bg-emerald-100 text-emerald-700' : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                    <Circle size={8} fill="currentColor" />
                    {selectedChat.school.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {selectedChat.messages.length === 0 ? (
                    <p className={`text-sm ${t.muted}`}>No broadcast or reply history for this school yet.</p>
                  ) : selectedChat.messages.map(item => {
                    if (item.kind === 'sent') {
                      const read = isReadBySchool(item.message.id, selectedChat.school.schoolId);
                      return (
                        <div key={`sent-${item.message.id}`} className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-3 text-white shadow-sm">
                          <p className="text-sm font-bold">{item.message.title}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-indigo-50">{item.message.body}</p>
                          <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-indigo-100">
                            <span>{new Date(item.message.sentAt).toLocaleString()}</span>
                            <CheckCheck size={14} className={read ? 'text-sky-200' : 'text-indigo-200'} />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={`reply-${item.reply.id}`} className={`mr-auto max-w-[82%] rounded-2xl rounded-bl-md px-4 py-3 shadow-sm ${isDark ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-800'}`}>
                        <p className="whitespace-pre-wrap text-sm">{item.reply.body}</p>
                        <p className={`mt-2 text-[11px] ${t.muted}`}>{new Date(item.reply.sentAt).toLocaleString()}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className={`flex flex-1 items-center justify-center p-8 text-sm ${t.muted}`}>Select a school to view chat history.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
