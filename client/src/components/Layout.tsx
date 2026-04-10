import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw,
  Bell,
  Trash2,
  Camera,
  LogOut,
  UserPlus,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { UserRole, Notification as NotificationType } from '@schofy/shared';
import { userDBManager } from '../lib/database/UserDatabaseManager';
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

export default function Layout({ children }: LayoutProps) {
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
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isOnline } = useAuth();
  const { isSyncing, syncNow } = useSync();
  const headerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

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
        const state = await getSubscriptionAccessState(user.id);
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
  }, [user?.id]);

  async function loadSchoolName() {
    if (!user?.id) return;
    try {
      // Load from local first
      const stored = await userDBManager.getAll(user.id, 'settings');
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
      const data = await userDBManager.getAll(user.id, 'notifications');
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
      const announcements = await userDBManager.getAll(user.id, 'announcements');
      const notifications = await userDBManager.getAll(user.id, 'notifications');
      const now = new Date();
      
      for (const ann of announcements) {
        const eventDate = ann.eventDate ? new Date(ann.eventDate) : new Date(ann.createdAt);
        const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntil > 0 && daysUntil <= 7) {
          const existingNotif = notifications.find(n => n.title === `Upcoming: ${ann.title}`);
          
          if (!existingNotif) {
            await userDBManager.add(user.id, 'notifications', {
              id: `notif-${ann.id}-${Date.now()}`,
              title: `Upcoming: ${ann.title}`,
              message: `Event in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
              type: 'info',
              read: 0,
              createdAt: new Date().toISOString(),
              link: '/announcements'
            });
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
      const notifications = await userDBManager.getAll(user.id, 'notifications');
      const unread = notifications.filter(n => n.read === 0);
      for (const notif of unread) {
        await userDBManager.put(user.id, 'notifications', { ...notif, read: 1 });
      }
      await loadNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  async function deleteNotification(id: string) {
    if (!user?.id) return;
    try {
      await userDBManager.delete(user.id, 'notifications', id);
      await loadNotifications();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  async function clearAllNotifications() {
    if (!user?.id) return;
    try {
      await userDBManager.clear(user.id, 'notifications');
      await loadNotifications();
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  const handleSync = async () => {
    await syncNow();
    window.location.reload();
  };

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

  const planLabel = subscriptionState?.plan?.name || 'Starter';
  const planStatusLabel = (() => {
    if (!subscriptionState) return 'No plan selected';
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
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 h-screen inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-xl transform transition-transform duration-200 ${
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header/Top Bar */}
        <header ref={headerRef} className="h-20 max-w-full w-full flex items-center justify-between px-8 shrink-0 z-30 border-b" style={{ backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)' }}>
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Menu size={22} className="text-white" />
            </button>
            <div className="flex-1 max-w-2xl relative group">
              <GlobalSearch />
            </div>
          </div>

          <div className="flex items-center gap-6 ml-6">
            <div className="hidden xl:flex items-center gap-4 text-white/80">
              <div className="text-right">
                <p className="text-lg font-bold text-white leading-none">{formatTime(currentTime)}</p>
                <p className="text-[11px] font-medium uppercase tracking-wider mt-1">{formatDate(currentTime)}</p>
              </div>
            </div>

            {/* Real-time Status Indicator */}
            <div className="hidden lg:block">
              <RealtimeStatus />
            </div>

              <div className="flex items-center gap-3">
              <div className="flex flex-col items-end mr-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${isSyncing ? 'text-white' : 'text-white/80'}`}>
                    {isSyncing ? 'Syncing...' : 'Synced'}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-white' : 'bg-white/50'} ${isSyncing ? 'animate-pulse' : ''}`} />
                </div>
                <div className="flex items-center justify-end gap-2 mt-0.5">
                  <span className={`text-[10px] ${isOnline ? 'text-white/70' : 'text-white/50'}`}>
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                  <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400' : 'bg-white/30'}`} />
                </div>
              </div>

              <button
                onClick={handleSync}
                disabled={isSyncing || !isOnline}
                className={`p-2 rounded-lg transition-all ${
                  isSyncing 
                    ? 'bg-white/20 cursor-not-allowed' 
                    : 'bg-[#2da32d] hover:bg-[#259626] cursor-pointer'
                }`}
                title="Sync and refresh"
              >
                <RefreshCw size={18} className={`text-white animate-[spin_4s_linear_infinite] ${isSyncing ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`} />
              </button>

              <button
                onClick={() => {
                  setNotifOpen(!notifOpen);
                  setProfileOpen(false);
                }}
                className="relative p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all cursor-pointer"
                title="Notifications"
              >
                <Bell size={18} className={`text-[#f68818] ${unreadCount > 0 ? 'animate-[shake_0.5s_ease-in-out_infinite]' : 'opacity-80'}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setNotifOpen(false);
                  setProfileOpen(false);
                  navigate('/recycle-bin');
                }}
                className="relative p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all cursor-pointer"
                title="Recycle Bin"
              >
                <Trash2 size={18} className="text-white/80" />
                {deletedItemsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                    {deletedItemsCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div 
                  className="absolute top-20 right-8 w-96 animate-dropdown-in z-50"
                >
                  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
                      <div className="flex items-center gap-3">
                        <Bell size={20} className="text-white" />
                        <h3 className="font-bold text-white text-lg">Notifications</h3>
                        {unreadCount > 0 && (
                          <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button onClick={markAllAsRead} className="hover:bg-white/20 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors">
                            Mark all read
                          </button>
                        )}
                        <button onClick={() => setNotifOpen(false)} className="hover:bg-white/20 rounded p-1.5 transition-colors">
                          <X size={18} className="text-white" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="py-12 text-center">
                          <Bell className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                          <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.slice(0, 5).map(notif => (
                          <div 
                            key={notif.id} 
                            className={`px-5 py-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group ${!notif.read ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}
                          >
                            <div className="flex items-start gap-4">
                              {!notif.read && (
                                <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full mt-2 shrink-0 animate-pulse" />
                              )}
                              <div className="flex-1 min-w-0" onClick={() => notif.link && navigate(notif.link)}>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                  {notif.title}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{notif.message}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">
                                  {new Date(notif.createdAt).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </p>
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }} 
                                className="text-slate-300 hover:text-red-500 p-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="px-5 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                      <button 
                        onClick={() => { clearAllNotifications(); setNotifOpen(false); }} 
                        className="text-xs text-red-500 dark:text-red-400 font-medium hover:text-red-600 dark:hover:text-red-300 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 size={14} />
                        Clear all
                      </button>
                      <button 
                        onClick={() => { setNotifOpen(false); navigate('/notifications'); }} 
                        className="text-xs font-medium transition-colors flex items-center gap-1.5"
                        style={{ color: 'var(--primary-color)' }}
                      >
                        View all
                        <span className="text-lg">→</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pl-6 border-l border-white/20 relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="w-10 h-10 rounded-full bg-white/20 p-0.5 border-2 border-white/30 hover:border-white/50 transition-all overflow-hidden"
                >
                  <img 
                    src={profileImage} 
                    alt="User" 
                    className="w-full h-full rounded-full object-cover object-top"
                  />
                </button>

                {profileOpen && (
                  <div 
                    className="absolute top-full right-0 mt-3 w-72 animate-dropdown-in z-50"
                  >
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="p-6 text-center border-b border-slate-100 dark:border-slate-700">
                        <div className="relative w-20 h-20 mx-auto mb-3">
                          <img 
                            src={profileImage} 
                            alt="Profile" 
                            className="w-20 h-20 rounded-full object-cover object-top border-4 border-white dark:border-slate-700 shadow-lg"
                          />
                          <label className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer shadow-lg transition-transform hover:scale-110"
                            style={{ backgroundColor: 'var(--primary-color)' }}
                          >
                            <Camera size={16} className="text-white" />
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleImageUpload} 
                              className="hidden"
                            />
                          </label>
                        </div>
                        <p className="font-bold text-slate-800 dark:text-white text-lg">{user?.firstName || user?.email?.split('@')[0] || 'User'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{user?.email || ''}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            Plan: {planLabel}
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-widest px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
                            Administrator
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">{planStatusLabel}</p>
                      </div>
                      <div className="p-2">
                        <button 
                          onClick={() => { setProfileOpen(false); navigate('/plans'); }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <CreditCard size={18} className="text-slate-400 dark:text-slate-500" />
                          <span className="font-medium">Plans & billing</span>
                        </button>
                        <div className="border-t border-slate-100 dark:border-slate-700 my-2 mx-4" />
                        <button 
                          onClick={() => { setProfileOpen(false); navigate('/settings'); }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <Settings size={18} className="text-slate-400 dark:text-slate-500" />
                          <span className="font-medium">Settings</span>
                        </button>
                        <div className="border-t border-slate-100 dark:border-slate-700 my-2 mx-4" />
                        <button 
                          onClick={() => { setProfileOpen(false); logout(); }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <LogOut size={18} />
                          <span className="font-medium">Sign Out</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8 overflow-y-auto bg-[#f8fafc] dark:bg-slate-950">
          <div className="max-w-[1600px] mx-auto">
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
