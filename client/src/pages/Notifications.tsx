import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Trash2, CheckCheck, Info, CheckCircle, AlertCircle, AlertTriangle, MessageSquare, Send, X, ExternalLink, Paperclip } from 'lucide-react';
import { Notification } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { useConfirm } from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import { parseAdminMessageLink } from '../utils/adminMessageLinks';
import { downloadAttachment, openExternalLink } from '../utils/externalActions';

interface SchoolReply {
  id: string;
  parentId: string;
  body: string;
  sentAt: string;
}

const typeConfig: Record<string, { bg: string; text: string; icon: any }> = {
  info: { bg: 'bg-blue-50', text: 'text-blue-600', icon: Info },
  success: { bg: 'bg-green-50', text: 'text-green-600', icon: CheckCircle },
  warning: { bg: 'bg-amber-50', text: 'text-amber-600', icon: AlertTriangle },
  error: { bg: 'bg-red-50', text: 'text-red-600', icon: AlertCircle },
};

export default function Notifications() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const confirm = useConfirm();
  const [replyTarget, setReplyTarget] = useState<Notification | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [schoolReplies, setSchoolReplies] = useState<SchoolReply[]>([]);
  const { data: rawNotifications, loading } = useTableData(sid, 'notifications');
  const notifications = useMemo(() =>
    [...rawNotifications].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [rawNotifications]
  ) as Notification[];

  useEffect(() => {
    void loadSchoolReplies();
  }, [sid]);

  async function loadSchoolReplies() {
    if (!supabase || !sid) return;
    try {
      const { data } = await supabase
        .from('admin_messages')
        .select('id,parent_id,body,sent_at')
        .eq('direction', 'reply')
        .eq('school_id', sid)
        .order('sent_at', { ascending: true });
      setSchoolReplies((data || []).map((reply: any) => ({
        id: reply.id,
        parentId: reply.parent_id || '',
        body: reply.body || '',
        sentAt: reply.sent_at,
      })));
    } catch {
      setSchoolReplies([]);
    }
  }

  async function markAllAsRead() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const unread = notifications.filter(n => !n.read);
      for (const notif of unread) {
        await dataService.update(id, 'notifications', notif.id, { read: true } as any);
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  async function markAsRead(notificationId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      await dataService.update(id, 'notifications', notificationId, { read: true } as any);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  async function deleteNotification(notificationId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      await dataService.delete(id, 'notifications', notificationId);
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  async function clearAll() {
    const id = schoolId || user?.id;
    if (!id) return;
    const ok = await confirm({ title: 'Clear All Notifications', description: 'Delete all notifications? This cannot be undone.', confirmLabel: 'Clear All', variant: 'danger' });
    if (!ok) return;
    try {
      const all = await dataService.getAll(id, 'notifications');
      for (const notif of all) {
        await dataService.delete(id, 'notifications', notif.id);
      }
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  async function clearChat() {
    const id = schoolId || user?.id;
    if (!id) return;
    const ok = await confirm({ title: 'Clear Super Admin Chat', description: 'Delete broadcast message notifications from this device? This will not delete messages already received by super admin.', confirmLabel: 'Clear Chat', variant: 'danger' });
    if (!ok) return;
    try {
      const all = await dataService.getAll(id, 'notifications');
      for (const notif of all) {
        if (parseAdminMessageLink(notif.link)) {
          await dataService.delete(id, 'notifications', notif.id);
        }
      }
    } catch (error) {
      console.error('Failed to clear chat:', error);
    }
  }

  async function sendReply() {
    const linkMeta = parseAdminMessageLink(replyTarget?.link);
    const parentId = linkMeta?.messageId || '';
    if (!replyTarget || !parentId || !replyBody.trim() || !supabase) return;
    setSendingReply(true);
    try {
      const now = new Date().toISOString();
      await supabase.from('admin_messages').insert({
        id: crypto.randomUUID(),
        title: `Reply: ${replyTarget.title}`,
        body: replyBody.trim(),
        target_schools: [],
        sent_at: now,
        sent_by: user?.email || 'School',
        direction: 'reply',
        parent_id: parentId,
        school_id: schoolId || user?.id,
        school_name: user?.email || 'School',
      });
      await dataService.update(sid, 'notifications', replyTarget.id, { read: true } as any);
      await loadSchoolReplies();
      setReplyTarget(null);
      setReplyBody('');
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSendingReply(false);
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <Bell className="text-indigo-600" size={28} />
            Notifications
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your notifications</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button 
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <CheckCheck size={18} />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button 
              onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              <Trash2 size={18} />
              Clear all
            </button>
          )}
          {notifications.some(n => parseAdminMessageLink(n.link)) && (
            <button 
              onClick={clearChat}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              <MessageSquare size={18} />
              Clear chat
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-slate-400">Loading...</div>
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Bell className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500 font-medium">No notifications yet</p>
          <p className="text-slate-400 text-sm mt-1">You're all caught up!</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {notifications.map((notif) => {
            const config = typeConfig[notif.type] || typeConfig.info;
            const Icon = config.icon;
            const linkMeta = parseAdminMessageLink(notif.link);
            const relatedReplies = linkMeta ? schoolReplies.filter(reply => reply.parentId === linkMeta.messageId) : [];
            return (
              <div 
                key={notif.id} 
                className={`flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${!notif.read ? 'bg-blue-50/30' : ''}`}
              >
                <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center shrink-0`}>
                  <Icon size={20} className={config.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800">{notif.title}</p>
                    {!notif.read && (
                      <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{notif.message}</p>
                  {linkMeta?.imageUrl && (
                    <img src={linkMeta.imageUrl} alt="" className="mt-3 max-h-56 w-full max-w-xl rounded-xl border border-slate-200 object-cover" />
                  )}
                  {linkMeta?.actionUrl && (
                    <button
                      type="button"
                      onClick={() => void openExternalLink(linkMeta.actionUrl)}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      <ExternalLink size={16} />
                      Open update link
                    </button>
                  )}
                  {linkMeta?.attachmentUrl && (
                    <button
                      type="button"
                      onClick={() => downloadAttachment(linkMeta.attachmentUrl, linkMeta.attachmentName)}
                      className="ml-0 mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 sm:ml-2"
                    >
                      <Paperclip size={16} />
                      Download {linkMeta.attachmentName || 'attachment'}
                    </button>
                  )}
                  {relatedReplies.length > 0 && (
                    <div className="mt-3 max-w-xl space-y-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Your replies</p>
                      {relatedReplies.map(reply => (
                        <div key={reply.id} className="rounded-lg bg-white p-2 text-sm text-slate-700">
                          <p>{reply.body}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{new Date(reply.sentAt).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(notif.createdAt).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {linkMeta?.allowReply && (
                    <button
                      onClick={() => { setReplyTarget(notif); setReplyBody(''); }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Reply to super admin"
                    >
                      <MessageSquare size={18} />
                    </button>
                  )}
                  {!notif.read && (
                    <button 
                      onClick={() => markAsRead(notif.id)}
                      className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Mark as read"
                    >
                      <CheckCheck size={18} />
                    </button>
                  )}
                  <button 
                    onClick={() => deleteNotification(notif.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {replyTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setReplyTarget(null); }}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 bg-indigo-600 px-5 py-4 text-white">
              <div>
                <h2 className="font-bold">Reply to Super Admin</h2>
                <p className="text-xs text-indigo-100">{replyTarget.title}</p>
              </div>
              <button onClick={() => setReplyTarget(null)} className="rounded-lg p-1 hover:bg-white/15"><X size={18} /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                {replyTarget.message}
              </div>
              {parseAdminMessageLink(replyTarget.link)?.imageUrl && (
                <img src={parseAdminMessageLink(replyTarget.link)?.imageUrl} alt="" className="max-h-48 w-full rounded-xl object-cover" />
              )}
              {parseAdminMessageLink(replyTarget.link)?.attachmentUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const meta = parseAdminMessageLink(replyTarget.link);
                    if (meta?.attachmentUrl) downloadAttachment(meta.attachmentUrl, meta.attachmentName);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
                >
                  <Paperclip size={16} />
                  Download {parseAdminMessageLink(replyTarget.link)?.attachmentName || 'attachment'}
                </button>
              )}
              <textarea
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Write your reply..."
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setReplyTarget(null)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button
                  onClick={sendReply}
                  disabled={sendingReply || !replyBody.trim()}
                  className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {sendingReply ? 'Sending...' : <span className="inline-flex items-center gap-2"><Send size={15} /> Send Reply</span>}
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

