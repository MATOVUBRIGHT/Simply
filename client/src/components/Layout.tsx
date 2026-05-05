import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { UserRole, Notification as NotificationType } from '@schofy/shared';
import { userDBManager } from '../lib/database/UserDatabaseManager';
import { dataService } from '../lib/database/SupabaseDataService';
import GlobalSearch from './GlobalSearch';
import InstallPWA from './InstallPWA';
import { getSubscriptionAccessState, SubscriptionAccessState } from '../utils/plans';
import { getRecycleBin } from '../utils/recycleBin';
import RealtimeStatus from './RealtimeStatus';

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
  { path: '/subjects', label: 'Subjects', icon: BookOpen, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/grades', label: 'Exams & Grades', icon: Award, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/finance', label: 'Fees & Finance', icon: Receipt, roles: [UserRole.ADMIN, UserRole.ACCOUNTANT] },
  { path: '/invoices', label: 'Invoices', icon: FileBarChart, roles: [UserRole.ADMIN, UserRole.ACCOUNTANT] },
  { path: '/transport', label: 'Transport', icon: Bus, roles: [UserRole.ADMIN] },
  { path: '/announcements', label: 'Announcements', icon: MessageSquare, roles: [UserRole.ADMIN, UserRole.TEACHER] },
  { path: '/reports', label: 'Reports', icon: ClipboardList, roles: [UserRole.ADMIN, UserRole.ACCOUNTANT] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: [UserRole.ADMIN] },
];

function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [profileImage, setProfileImage] = useState<string>('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=64&h=64&fit=crop');
  const [schoolName, setSchoolName] = useState('My School');
  const [deletedItemsCount, setDeletedItemsCount] = useState(0);
  const [showRenewPopup, setShowRenewPopup] = useState(false);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionAccessState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, schoolId, logout, isOnline } = useAuth();
  const tenantId = schoolId || user?.id;
  const { isSyncing } = useSync();
  const headerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const sid = schoolId || user?.id;
      if (sid) {
        const { store } = await import('../lib/store');
        const { dataService } = await import('../lib/database/SupabaseDataService');
        // Flush offline queue first, then sync all tables
        await dataService.flushOfflineQueue();
        const tables = [
          'students','staff','classes','subjects','fees','payments',
          'announcements','attendance','feeStructures','exams','examResults',
          'transportRoutes','salaryPayments','bursaries','discounts','notifications',
        ];
        await Promise.allSettled(tables.map(t => dataService.syncTable(sid, t)));
      }
    } catch { /* ignore */ }
    finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [isRefreshing, schoolId, user?.id]);

  useEffect(() => {
    loadNotifications();
    checkUpcomingEvents();
    checkSubscriptionStatus();
    loadSchoolName();
    loadDeletedItemsCount();
  }, []);

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
    if (!tenantId) return;
    try {
      const stored = await userDBManager.getAll(tenantId, 'settings');
      const schoolNameSetting = stored.find((s: any) => s.key === 'schoolName');
      if (schoolNameSetting?.value) {
        setSchoolName(schoolNameSetting.value);
      }
    } catch (error) {
      console.error('Failed to load school name:', error);
    }
  }

  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.schoolName) {
        setSchoolName(customEvent.detail.schoolName);
      }
    };
    window.addEventListener('settingsUpdated', handleSettingsUpdate);
    window.addEventListener('dataRefresh', loadSchoolName);
    return () => {
      window.removeEventListener('settingsUpdated', handleSettingsUpdate);
      window.removeEventListener('dataRefresh', loadSchoolName);
    };
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setProfileImage(result);
        localStorage.setItem('profileImage', result);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const savedImage = localStorage.getItem('profileImage');
    if (savedImage) setProfileImage(savedImage);
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

  const planLabel = subscriptionState?.plan?.name ?? 'No subscription';
  const planStatusLabel = (() => {
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

  return (
    <div className="min-h-screen flex bg-[#f8fafc] dark:bg-slate-950">
      {/* Sidebar — always fixed, never scrolls away */}
      <aside
        className={`fixed top-0 h-screen inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xl transform transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* School Header */}
          <div className="flex items-center gap-3 h-20 px-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
              <GraduationCap size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm leading-tight text-slate-800 dark:text-white truncate">
                {schoolName}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Powered by Schofy</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden absolute top-4 right-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
            {filteredMenuItems.map(item => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group ${
                    isActive 
                      ? 'text-white shadow-md' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  style={isActive ? { backgroundColor: 'var(--primary-color)' } : {}}
                >
                  <Icon size={20} className={isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'} />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Powered by Footer */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">Powered by <span className="font-medium">Schofy</span></p>
          </div>
        </div>
      </aside>

      {/* Main Content — offset by sidebar width on large screens */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        {/* Header/Top Bar — sticky at top of main column */}
        <header ref={headerRef} className="sticky top-0 shrink-0 z-30 border-b" style={{ backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}>
          {/* Main header row */}
          <div className="flex items-center gap-2 px-3 sm:px-6 h-16">
            {/* Hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors shrink-0"
            >
              <Menu size={22} className="text-white" />
            </button>

            {/* Search — always visible, grows to fill space */}
            <div className="flex-1 min-w-0">
              <GlobalSearch />
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Time — hidden on small screens */}
              <div className="hidden xl:flex items-center gap-4 text-white/80 mr-2">
                <div className="text-right">
                  <p className="text-base font-bold text-white leading-none">{formatTime(currentTime)}</p>
                  <p className="text-[10px] font-medium uppercase tracking-wider mt-1">{formatDate(currentTime)}</p>
                </div>
              </div>

              {/* Realtime status — hidden on small */}
              <div className="hidden lg:block">
                <RealtimeStatus />
              </div>

              {/* Refresh button — replaces sync text */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all disabled:opacity-60"
                title="Refresh all data"
              >
                <RefreshCw size={17} className={`text-white/90 ${isRefreshing ? 'animate-spin' : ''}`} />
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
                  <button onClick={() => { setNotifOpen(false); navigate('/notifications'); }} className="text-xs font-medium" style={{ color: 'var(--primary-color)' }}>View all →</button>
                </div>
              </div>
            </div>
          )}

          {/* Profile dropdown */}
          {profileOpen && (
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
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700">Plan: {planLabel}</span>
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
                  <button onClick={() => { setProfileOpen(false); logout(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <LogOut size={16} className="shrink-0" />
                    <span className="font-medium text-sm">Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>

        {!isOnline && (
          <div
            className="shrink-0 text-center text-sm font-medium py-2.5 px-4 bg-amber-400 text-amber-950 border-b border-amber-500/30"
            role="status"
          >
            Offline — you can keep working. Changes stay on this device and sync automatically when the connection returns.
          </div>
        )}

        {/* Page Content — scrolls vertically, allows horizontal scroll on small screens */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto overflow-x-auto bg-[#f8fafc] dark:bg-slate-950">
          <div className="max-w-[1600px] mx-auto min-w-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <InstallPWA />
    </div>
  );
}

export default React.memo(Layout);
