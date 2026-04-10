import { useEffect, useState } from 'react';
import { Bell, Trash2, CheckCheck, Info, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { Notification } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/DataService';

const typeConfig: Record<string, { bg: string; text: string; icon: any }> = {
  info: { bg: 'bg-blue-50', text: 'text-blue-600', icon: Info },
  success: { bg: 'bg-green-50', text: 'text-green-600', icon: CheckCircle },
  warning: { bg: 'bg-amber-50', text: 'text-amber-600', icon: AlertTriangle },
  error: { bg: 'bg-red-50', text: 'text-red-600', icon: AlertCircle },
};

export default function Notifications() {
  const { user, schoolId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    if (user?.id || schoolId) loadNotifications(); 
  }, [user?.id, schoolId]);

  async function loadNotifications() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const data = await dataService.getAll(id, 'notifications');
      const sorted = data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(sorted);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
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
      await loadNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  async function markAsRead(notificationId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      await dataService.update(id, 'notifications', notificationId, { read: true } as any);
      await loadNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  async function deleteNotification(notificationId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      await dataService.delete(id, 'notifications', notificationId);
      await loadNotifications();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  async function clearAll() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (confirm('Are you sure you want to delete all notifications?')) {
      try {
        const all = await dataService.getAll(id, 'notifications');
        for (const notif of all) {
          await dataService.delete(id, 'notifications', notif.id);
        }
        await loadNotifications();
      } catch (error) {
        console.error('Failed to clear notifications:', error);
      }
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
    </div>
  );
}
