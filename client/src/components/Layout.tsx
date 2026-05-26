import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  GraduationCap,
  Menu,
  X,
  Receipt,
  Award,
  Users,
  Calendar,
  BookOpen,
  Settings,
  FileBarChart,
  Bus,
  BedDouble,
  Building2,
  MessageSquare,
  ClipboardList,
  Bell,
  Trash2,
  Camera,
  LogOut,
  UserPlus,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  Shield,
  Send,
  ExternalLink,
  Paperclip,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { useToast } from '../contexts/ToastContext';
import { UserRole, Notification as NotificationType } from '@schofy/shared';
import { userDBManager } from '../lib/database/UserDatabaseManager';
import { dataService } from '../lib/database/SupabaseDataService';
import { compressImageFile } from '../utils/imageCompression';
import GlobalSearch from './GlobalSearch';
import InstallPWA from './InstallPWA';
import { useStaffAuth } from '../contexts/StaffAuthContext';
import { getSubscriptionAccessState, SubscriptionAccessState } from '../utils/plans';
import { getRecycleBin } from '../utils/recycleBin';
import RealtimeStatus from './RealtimeStatus';
import SchofyAssistant from './SchofyAssistant';
import { store, useTableData } from '../lib/store';
import { supabase } from '../lib/supabase';
import { parseAdminMessageLink } from '../utils/adminMessageLinks';
import { downloadAttachment, openExternalLink } from '../utils/externalActions';

const assetBase = import.meta.env.BASE_URL || './';
const APP_VERSION = '2.4.0';
const DEFAULT_PROFILE_IMAGE =
  "data:image/svg+xml,%3Csvg width='96' height='96' viewBox='0 0 96 96' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='96' height='96' rx='48' fill='%23E0F2FE'/%3E%3Ccircle cx='48' cy='36' r='16' fill='%230F4C81'/%3E%3Cpath d='M22 82c4.8-17.5 15.1-26 26-26s21.2 8.5 26 26' fill='%232DA32D'/%3E%3C/svg%3E";

interface LayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.TEACHER, UserRole.ACCOUNTANT] },
  { path: '/students', label: 'Students', icon: GraduationCap, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/admission', label: 'Admission', icon: UserPlus, roles: [UserRole.ADMIN] },
  { path: '/staff', label: 'Teachers & Staff', icon: Users, roles: [UserRole.ADMIN] },
  { path: '/classes', label: 'Classes', icon: Building2, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/attendance', label: 'Attendance', icon: Calendar, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/day-boarding', label: 'Day & Boarding', icon: BedDouble, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/subjects', label: 'Subjects', icon: BookOpen, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/grades', label: 'Exams & Grades', icon: Award, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/finance', label: 'Fees & Finance', icon: Receipt, roles: [UserRole.ADMIN, UserRole.ACCOUNTANT] },
  { path: '/invoices', label: 'Invoices', icon: FileBarChart, roles: [UserRole.ADMIN, UserRole.ACCOUNTANT] },
  { path: '/transport', label: 'Transport', icon: Bus, roles: [UserRole.ADMIN] },
  { path: '/announcements', label: 'Announcements', icon: MessageSquare, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/reports', label: 'Reports', icon: ClipboardList, roles: [UserRole.ADMIN, UserRole.ACCOUNTANT] },
  { path: '/roles', label: 'Roles & Access', icon: Shield, roles: [UserRole.ADMIN] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: [UserRole.ADMIN] },
];

function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [profileImage, setProfileImage] = useState<string>(DEFAULT_PROFILE_IMAGE);
  const [deletedItemsCount, setDeletedItemsCount] = useState(0);
  const [showRenewPopup, setShowRenewPopup] = useState(false);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionAccessState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [broadcastPopup, setBroadcastPopup] = useState<NotificationType | null>(null);
  const [broadcastReply, setBroadcastReply] = useState('');
  const [sendingBroadcastReply, setSendingBroadcastReply] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, schoolId, logout, isOnline } = useAuth();
  const { isStaffMode, staffSession, staffLogout } = useStaffAuth();
  const tenantId = schoolId || user?.id;
  const { isSyncing, syncNow, isSyncEnabled } = useSync();
  const { addToast } = useToast();
  const headerRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Reactive school name + logo from settings store - updates instantly when settings change
  const { data: settings } = useTableData(schoolId || user?.id || '', 'settings');
  const schoolName = useMemo(() => settings.find((s: any) => s.key === 'schoolName')?.value || 'Schofy', [settings]);
  const schoolLogo = useMemo(() => settings.find((s: any) => s.key === 'schoolLogo')?.value || '', [settings]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    if (!isOnline) {
      addToast('You are offline. Local data is still available.', 'warning');
      return;
    }
    if (!isSyncEnabled) {
      addToast('Enable cloud sync first', 'warning');
      return;
    }
    setIsRefreshing(true);
    try {
      await syncNow(true);
    } catch {
      addToast('Sync will retry automatically', 'error');
    }
    finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [addToast, isOnline, isRefreshing, isSyncEnabled, syncNow]);

  useEffect(() => {
    loadNotifications();
    checkUpcomingEvents();
    checkSubscriptionStatus();
    loadDeletedItemsCount();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !isOnline) return;
    const tid = schoolId || user.id;
    let cancelled = false;
    const syncNotifications = async () => {
      try {
        dataService.startRealtimeSync(tid);
        await dataService.refreshNotifications(tid);
        if (!cancelled) await loadNotifications();
      } catch (error) {
        console.error('Failed to refresh online notifications:', error);
      }
    };
    void syncNotifications();
    window.addEventListener('online', syncNotifications);
    return () => {
      cancelled = true;
      window.removeEventListener('online', syncNotifications);
    };
  }, [user?.id, schoolId, isOnline, isSyncEnabled]);

  useEffect(() => {
    const refreshNotifications = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (!table || table === 'notifications') void loadNotifications();
    };
    window.addEventListener('dataRefresh', refreshNotifications);
    window.addEventListener('schofyDataRefresh', refreshNotifications);
    return () => {
      window.removeEventListener('dataRefresh', refreshNotifications);
      window.removeEventListener('schofyDataRefresh', refreshNotifications);
    };
  }, [user?.id]);

  useEffect(() => {
    const latestBroadcast = notifications.find((n: any) =>
      !n.read &&
      parseAdminMessageLink(n.link) &&
      localStorage.getItem(`schofy_broadcast_popup_seen_${n.id}`) !== '1'
    );
    if (latestBroadcast) setBroadcastPopup(latestBroadcast);
  }, [notifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function loadDeletedItemsCount() {
    if (!user?.id) return;
    try {
      const items = getRecycleBin(user.id);
      setDeletedItemsCount(items.length);
    } catch (error) {
      console.error('Failed to load deleted items count:', error);
    }
  }

  useEffect(() => {
    window.addEventListener('recycleBinUpdated', loadDeletedItemsCount);
    return () => window.removeEventListener('recycleBinUpdated', loadDeletedItemsCount);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setSubscriptionState(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const tid = schoolId || user.id;
        const state = await getSubscriptionAccessState(tid, undefined, { authUserId: user.id });
        if (!cancelled) {
          setSubscriptionState(state);
        }
      } catch (error) {
        console.error('Failed to load subscription state:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, schoolId]);

  async function loadSchoolName() {
    // No longer needed -- school name comes from useTableData reactively
  }

  useEffect(() => {
    // Keep settingsUpdated listener for legacy compatibility
    const handleSettingsUpdate = (e: Event) => { void e; };
    window.addEventListener('settingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('settingsUpdated', handleSettingsUpdate);
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const result = await compressImageFile(file, 800, 0.82);
      setProfileImage(result);
      localStorage.setItem('profileImage', result);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;
    const base64 = await compressImageFile(file, 900, 0.84);
    try {
      await dataService.saveSettings(tenantId, { schoolLogo: base64 });
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
    } catch { /* ignore */ }
    e.target.value = '';
  };

  useEffect(() => {
    const savedImage = localStorage.getItem('profileImage');
    if (savedImage && !/^https?:\/\//i.test(savedImage)) {
      setProfileImage(savedImage);
    } else if (savedImage) {
      localStorage.removeItem('profileImage');
      setProfileImage(DEFAULT_PROFILE_IMAGE);
    }
  }, []);

  async function loadNotifications() {
    if (!user?.id) return;
    try {
      const data = await dataService.getAll(user.id, 'notifications');
      const sorted = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotifications(sorted);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  }

  async function checkSubscriptionStatus() {
    // Disable subscription check
    return;
  }

  async function checkUpcomingEvents() {
    if (!user?.id) return;
    try {
      const announcements = await dataService.getAll(user.id, 'announcements');
      const notifications = await dataService.getAll(user.id, 'notifications');
      const now = new Date();
      
      for (const ann of announcements) {
        const eventDate = ann.eventDate ? new Date(ann.eventDate) : new Date(ann.createdAt);
        const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntil > 0 && daysUntil <= 7) {
          const existingNotif = notifications.find(n => n.title === `Upcoming: ${ann.title}`);
          
          if (!existingNotif) {
            await dataService.create(user.id, 'notifications', {
              id: `notif-${ann.id}-${Date.now()}`,
              title: `Upcoming: ${ann.title}`,
              message: `Event in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
              type: 'info',
              read: 0,
              createdAt: new Date().toISOString(),
              link: '/announcements'
            } as any);
          }
        }
      }
      await loadNotifications();
    } catch (error) {
      console.error('Failed to check upcoming events:', error);
    }
  }

  async function markAllAsRead() {
    if (!user?.id) return;
    try {
      const notifications = await dataService.getAll(user.id, 'notifications');
      const unread = notifications.filter(n => n.read === 0);
      for (const notif of unread) {
        await dataService.update(user.id, 'notifications', notif.id, { ...notif, read: 1 } as any);
      }
      await loadNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  async function deleteNotification(id: string) {
    if (!user?.id) return;
    try {
      await dataService.delete(user.id, 'notifications', id);
      await loadNotifications();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  async function closeBroadcastPopup(markRead = false) {
    if (!broadcastPopup || !user?.id) {
      setBroadcastPopup(null);
      return;
    }
    localStorage.setItem(`schofy_broadcast_popup_seen_${broadcastPopup.id}`, '1');
    if (markRead) {
      try {
        await dataService.update(user.id, 'notifications', broadcastPopup.id, { read: true } as any);
        await loadNotifications();
      } catch { /* ignore */ }
    }
    setBroadcastPopup(null);
    setBroadcastReply('');
  }

  async function sendBroadcastReply() {
    if (!broadcastPopup || !broadcastReply.trim() || !supabase || !user?.id) return;
    setSendingBroadcastReply(true);
    try {
      const linkMeta = parseAdminMessageLink(broadcastPopup.link);
      const parentId = linkMeta?.messageId || '';
      if (!parentId || !linkMeta?.allowReply) return;
      const now = new Date().toISOString();
      await supabase.from('admin_messages').insert({
        id: crypto.randomUUID(),
        title: `Reply: ${broadcastPopup.title}`,
        body: broadcastReply.trim(),
        target_schools: [],
        sent_at: now,
        sent_by: user.email || 'School',
        direction: 'reply',
        parent_id: parentId,
        school_id: schoolId || user.id,
        school_name: schoolName || user.email || 'School',
      });
      await closeBroadcastPopup(true);
    } catch (error) {
      console.error('Failed to send broadcast reply:', error);
    } finally {
      setSendingBroadcastReply(false);
    }
  }

  async function clearAllNotifications() {
    if (!user?.id) return;
    try {
      const current = await dataService.getAll(user.id, 'notifications');
      for (const notif of current) {
        await dataService.delete(user.id, 'notifications', notif.id);
      }
      await loadNotifications();
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const isLocalOnlyAccount = Boolean(user?.localOnly || localStorage.getItem('schofy_local_only_session') === 'true');
  const planLabel = isLocalOnlyAccount ? 'Offline mode only' : subscriptionState?.plan?.name ?? 'No subscription';
  const planStatusLabel = (() => {
    if (isLocalOnlyAccount) return isOnline ? 'Local desktop account. Cloud sync is off.' : 'Local desktop account. Fully offline.';
    if (!subscriptionState) return 'No plan selected';
    if (subscriptionState.status === 'incomplete') return 'Choose a plan';
    if (subscriptionState.status === 'active') return 'Active';
    if (subscriptionState.status === 'expiring' && subscriptionState.daysRemaining !== null) {
      return `Expiring in ${subscriptionState.daysRemaining} day${subscriptionState.daysRemaining === 1 ? '' : 's'}`;
    }
    if (subscriptionState.status === 'expiring') return 'Expiring soon';
    if (subscriptionState.status === 'expired') return 'Expired';
    return 'Plan status unknown';
  })();

  const filteredMenuItems = user ? menuItems : [];
  const broadcastLinkMeta = parseAdminMessageLink(broadcastPopup?.link);

  return (
    <div className="min-h-screen flex bg-[#f8fafc] dark:bg-slate-950 overflow-x-hidden">
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-[45] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      {broadcastPopup && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="px-5 py-4 text-white" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-white/70">Schofy assistant broadcast</p>
                  <h2 className="mt-1 text-lg font-bold">{broadcastPopup.title}</h2>
                </div>
                <button onClick={() => void closeBroadcastPopup(false)} className="rounded-lg p-1 hover:bg-white/15">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="space-y-4 p-5">
              {broadcastLinkMeta?.imageUrl && (
                <img src={broadcastLinkMeta.imageUrl} alt="" className="max-h-56 w-full rounded-xl border border-slate-200 object-cover dark:border-slate-700" />
              )}
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{broadcastPopup.message}</p>
              {broadcastLinkMeta?.actionUrl && (
                <button
                  type="button"
                  onClick={async () => {
                    await openExternalLink(broadcastLinkMeta.actionUrl);
                    await closeBroadcastPopup(true);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <ExternalLink size={16} />
                  Open update link
                </button>
              )}
              {broadcastLinkMeta?.attachmentUrl && (
                <button
                  type="button"
                  onClick={() => downloadAttachment(broadcastLinkMeta.attachmentUrl, broadcastLinkMeta.attachmentName)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <Paperclip size={16} />
                  Download {broadcastLinkMeta.attachmentName || 'attachment'}
                </button>
              )}
              {broadcastLinkMeta?.allowReply && (
                <textarea
                  value={broadcastReply}
                  onChange={e => setBroadcastReply(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  placeholder="Reply to Schofy assistant..."
                />
              )}
              <div className="flex gap-2">
                <button onClick={() => void closeBroadcastPopup(true)} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  Mark read
                </button>
                {broadcastLinkMeta?.allowReply && (
                  <button
                    onClick={sendBroadcastReply}
                    disabled={sendingBroadcastReply || !broadcastReply.trim()}
                    className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {sendingBroadcastReply ? 'Sending...' : <span className="inline-flex items-center gap-2"><Send size={15} /> Reply</span>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sidebar -- always fixed, never scrolls away */}
      <aside
        onMouseEnter={() => !sidebarOpen && setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={`fixed top-0 h-screen inset-y-0 left-0 z-50 bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xl transition-[width,transform] duration-150 ${
          mobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        } ${!mobileSidebarOpen && (sidebarOpen || sidebarHovered ? 'w-64' : 'lg:w-20')}`}
      >
        <div className="h-full flex flex-col">
          {/* School Header */}
          <div className="flex items-center gap-3 h-20 px-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <label className="relative w-10 h-10 rounded-lg flex items-center justify-center shadow-lg shrink-0 cursor-pointer group overflow-hidden" style={{ backgroundColor: schoolLogo ? 'transparent' : 'var(--primary-color)' }} title="Click to change school logo">
              {schoolLogo ? (
                <img src={schoolLogo} alt="School Logo" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <GraduationCap size={22} className="text-white" />
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <Camera size={14} className="text-white" />
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            <div className={`flex-1 min-w-0 ${sidebarOpen || sidebarHovered || mobileSidebarOpen ? 'opacity-100' : 'opacity-0 w-0 hidden'}`}>
              <h2 className="font-bold text-sm leading-tight text-slate-800 dark:text-white truncate">
                {schoolName}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Powered by Schofy</p>
            </div>
            {mobileSidebarOpen && (
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="lg:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar overflow-x-visible" style={{ direction: 'rtl' }}>
            <div style={{ direction: 'ltr' }}>
              {filteredMenuItems.map(item => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={`flex items-center rounded-lg group relative h-11 ${
                      isActive 
                        ? 'text-white shadow-sm' 
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                    }`}
                    style={isActive ? { backgroundColor: 'var(--primary-color)' } : {}}
                  >
                    {/* Simple nav item — no complex hover expand */}
                    <div className="flex items-center gap-3 h-full w-full px-4">
                      <Icon size={20} className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}`} />
                      <span className={`text-sm font-bold whitespace-nowrap overflow-hidden ${sidebarOpen || sidebarHovered || mobileSidebarOpen ? 'opacity-100' : 'opacity-0 w-0'}`}>
                        {item.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Sidebar Footer: Minimize Button & Powered By on same line */}
          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0">
            <div className={`transition-all duration-300 ${sidebarOpen || sidebarHovered || mobileSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}`}>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">Powered by <span className="font-medium">Schofy</span> · v{APP_VERSION}</p>
            </div>
            
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-all ${!sidebarOpen && !sidebarHovered && !mobileSidebarOpen ? 'w-full flex justify-center' : ''}`}
              title={sidebarOpen ? "Minimize Sidebar" : "Expand Sidebar"}
            >
              <div className={`transition-transform duration-300 ${!sidebarOpen ? 'rotate-180' : ''}`}>
                <ChevronLeft size={18} />
              </div>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content -- offset by sidebar width on large screens */}
      <div className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-150 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        {/* Header/Top Bar -- sticky at top of main column */}
        <header ref={headerRef} className="sticky top-0 shrink-0 z-30 border-b" style={{ backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}>
          {/* Main header row */}
          <div className="flex items-center gap-2 px-3 sm:px-6 h-16">
            {/* Hamburger */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0"
            >
              <Menu size={22} className="text-white" />
            </button>

            {/* Search -- always visible, grows to fill space */}
            <div className="flex-1 min-w-0">
              <GlobalSearch />
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Time -- hidden on small screens */}
              <div className="hidden xl:flex items-center gap-4 text-white/80 mr-2">
                <div className="text-right">
                  <p className="text-base font-bold text-white leading-none">{formatTime(currentTime)}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wider mt-1">{formatDate(currentTime)}</p>
                </div>
              </div>

              {/* Realtime status -- hidden on small */}
              <div className="hidden lg:block">
                <RealtimeStatus />
              </div>

              {/* Refresh button -- replaces sync text */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing || isSyncing}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all disabled:opacity-60"
                title={isSyncing ? 'Syncing data...' : 'Sync data now'}
              >
                <RefreshCw size={17} className={`text-white/90 ${isRefreshing || isSyncing ? 'animate-spin' : ''}`} />
              </button>

              {/* Notifications */}
              <button
                onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
                className="relative p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                title="Notifications"
              >
                <Bell size={18} className={`text-[#f68818] ${unreadCount > 0 ? 'animate-[shake_0.5s_ease-in-out_infinite]' : 'opacity-80'}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Recycle bin */}
              <button
                onClick={() => { setNotifOpen(false); setProfileOpen(false); navigate('/recycle-bin'); }}
                className="relative p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                title="Recycle Bin"
              >
                <Trash2 size={18} className="text-white/80" />
                {deletedItemsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {deletedItemsCount}
                  </span>
                )}
              </button>

              {/* Profile */}
              <div className="relative pl-2 border-l border-white/20">
                <button
                  onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
                  className="w-9 h-9 rounded-full bg-white/20 p-0.5 border-2 border-white/30 hover:border-white/50 transition-all overflow-hidden"
                >
                  <img src={profileImage} alt="User" className="w-full h-full rounded-full object-cover object-top" />
                </button>
              </div>
            </div>
          </div>

          {/* Notifications dropdown */}
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute top-16 right-2 sm:right-6 w-[calc(100vw-1rem)] sm:w-96 max-w-sm animate-dropdown-in z-50">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
                  <div className="flex items-center gap-2">
                    <Bell size={18} className="text-white" />
                    <h3 className="font-bold text-white">Notifications</h3>
                    {unreadCount > 0 && <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount} new</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && <button onClick={markAllAsRead} className="hover:bg-white/20 rounded px-2 py-1 text-xs font-medium text-white">Mark read</button>}
                    <button onClick={() => setNotifOpen(false)} className="hover:bg-white/20 rounded p-1"><X size={16} className="text-white" /></button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center"><Bell className="mx-auto text-slate-300 mb-2" size={32} /><p className="text-slate-400 text-sm">No notifications</p></div>
                  ) : notifications.slice(0, 5).map(notif => (
                    <div key={notif.id} className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer group ${!notif.read ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}>
                      <div className="flex items-start gap-3">
                        {!notif.read && <div className="w-2 h-2 bg-indigo-600 rounded-full mt-1.5 shrink-0 animate-pulse" />}
                        <div className="flex-1 min-w-0" onClick={() => notif.link && navigate(notif.link)}>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{notif.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.message}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-between">
                  <button onClick={() => { clearAllNotifications(); setNotifOpen(false); }} className="text-xs text-red-500 font-medium flex items-center gap-1"><Trash2 size={12} />Clear all</button>
                  <button onClick={() => { setNotifOpen(false); navigate('/notifications'); }} className="text-xs font-medium" style={{ color: 'var(--primary-color)' }}>View all &rarr;</button>
                </div>
              </div>
            </div>
            </>
          )}

          {/* Profile dropdown */}
          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              <div className="absolute top-16 right-2 sm:right-6 w-72 animate-dropdown-in z-50">
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[80vh] overflow-y-auto">
                <div className="p-5 text-center border-b border-slate-100 dark:border-slate-700">
                  <div className="relative w-16 h-16 mx-auto mb-2">
                    <img src={profileImage} alt="Profile" className="w-16 h-16 rounded-full object-cover border-4 border-white dark:border-slate-700 shadow-lg" />
                    <label className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 transition-transform" style={{ backgroundColor: 'var(--primary-color)' }}>
                      <Camera size={14} className="text-white" />
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>
                  <p className="font-bold text-slate-800 dark:text-white">{user?.firstName || user?.email?.split('@')[0] || 'User'}</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{user?.email || ''}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${isLocalOnlyAccount ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700'}`}>{isLocalOnlyAccount ? planLabel : `Plan: ${planLabel}`}</span>
                    <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600">Admin</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{planStatusLabel}</p>
                </div>
                <div className="p-2">
                  {[
                    { label: 'Plans & Billing', icon: CreditCard, path: '/plans' },
                    { label: 'Settings', icon: Settings, path: '/settings' },
                    { label: 'Notifications', icon: Bell, path: '/notifications' },
                    { label: 'Recycle Bin', icon: Trash2, path: '/recycle-bin' },
                  ].map(({ label, icon: Icon, path }) => (
                    <button key={path} onClick={() => { setProfileOpen(false); navigate(path); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <Icon size={16} className="text-slate-400 shrink-0" />
                      <span className="font-medium text-sm">{label}</span>
                    </button>
                  ))}
                  <div className="border-t border-slate-100 dark:border-slate-700 my-1 mx-3" />
                  {isStaffMode && (
                    <button onClick={() => { setProfileOpen(false); staffLogout(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                      <Shield size={16} className="shrink-0" />
                      <span className="font-medium text-sm">Exit Staff Mode ({staffSession?.staffMember.staffId})</span>
                    </button>
                  )}
                  <button onClick={() => { setProfileOpen(false); logout(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <LogOut size={16} className="shrink-0" />
                    <span className="font-medium text-sm">Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
            </>
          )}
        </header>

        {!isOnline && (
          <div
            className="shrink-0 text-center text-sm font-medium py-2.5 px-4 bg-amber-400 text-amber-950 border-b border-amber-500/30"
            role="status"
          >
            {isLocalOnlyAccount
              ? 'Offline mode only account - everything stays on this desktop and all features remain available locally.'
              : 'Offline - you can keep working. Changes stay on this device and sync automatically when the connection returns.'}
          </div>
        )}

        {/* Page Content — scrolls vertically, allows horizontal scroll on small screens */}
        <main className="flex-1 min-h-0 bg-[#f8fafc] dark:bg-slate-950" style={{ isolation: 'auto' }}>
          <div className="app-page-scroll h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="app-page-content w-full min-w-0">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <InstallPWA />
      <SchofyAssistant />
    </div>
  );
}

export default React.memo(Layout);
