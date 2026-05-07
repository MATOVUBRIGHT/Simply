import { ReactNode, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, School, Users, LogOut, Menu, X, Shield,
  ChevronRight, Sun, Moon, ClipboardCheck, BarChart2, ShieldAlert, Search,
} from 'lucide-react';
import { useAdminAuth } from './AdminAuthContext';
import { useAdminTheme } from './AdminThemeContext';
import { supabase } from '../lib/supabase';

const navItems = [
  { to: '/admin/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/schools',       icon: School,          label: 'Schools' },
  { to: '/admin/users',         icon: Users,           label: 'Users' },
  { to: '/admin/verifications', icon: ClipboardCheck,  label: 'Verifications' },
  { to: '/admin/analytics',     icon: BarChart2,       label: 'Analytics' },
  { to: '/admin/security',      icon: ShieldAlert,     label: 'Security' },
];

interface SearchResult {
  type: 'school' | 'user';
  id: string;
  label: string;
  sub: string;
  href: string;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { admin, logout } = useAdminAuth();
  const { theme, toggle } = useAdminTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDark = theme === 'dark';

  // Close search on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); setShowSearch(false); return; }
    setShowSearch(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!supabase) return;
      setSearchLoading(true);
      try {
        const [usersRes, settingsRes] = await Promise.all([
          supabase.from('users').select('id, school_id, email, first_name, last_name').ilike('email', `%${q}%`).limit(5),
          supabase.from('settings').select('school_id, value').eq('key', 'schoolName').ilike('value', `%${q}%`).limit(5),
        ]);
        const results: SearchResult[] = [];
        (usersRes.data || []).forEach((u: any) => {
          results.push({
            type: 'user', id: u.id,
            label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
            sub: u.email,
            href: `/admin/schools/${u.school_id || u.id}`,
          });
        });
        (settingsRes.data || []).forEach((s: any) => {
          results.push({
            type: 'school', id: s.school_id,
            label: String(s.value),
            sub: s.school_id,
            href: `/admin/schools/${s.school_id}`,
          });
        });
        setSearchResults(results);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }

  const handleLogout = () => { logout(); navigate('/admin/login'); };

  // Theme classes
  const bg = isDark ? 'bg-slate-950' : 'bg-slate-50';
  const sidebarBg = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const headerBg = isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const navActive = isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white';
  const navInactive = isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';
  const searchBg = isDark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-100 border-slate-200 text-slate-900 placeholder-slate-400';
  const dropdownBg = isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const dropdownHover = isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-50';

  return (
    <div className={`min-h-screen ${bg} ${textPrimary} flex`}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 ${sidebarBg} border-r flex flex-col transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:flex`}>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-5 py-5 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <p className={`text-sm font-bold ${textPrimary}`}>Schofy Admin</p>
            <p className={`text-xs ${textMuted}`}>Super Admin Portal</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className={`ml-auto lg:hidden p-1 rounded-lg ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive ? navActive : navInactive}`
              }
            >
              <Icon size={17} />
              {label}
              <ChevronRight size={13} className="ml-auto opacity-40" />
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className={`px-3 py-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          {/* Theme toggle */}
          <button onClick={toggle}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium mb-1 transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>

          {/* Admin info */}
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">SA</div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${textPrimary} truncate`}>{admin?.name}</p>
              <p className={`text-xs ${textMuted} truncate`}>{admin?.email}</p>
            </div>
          </div>

          <button onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/20' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'}`}
          >
            <LogOut size={17} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className={`sticky top-0 z-30 ${headerBg} backdrop-blur border-b px-4 py-3 flex items-center gap-3`}>
          <button onClick={() => setSidebarOpen(true)} className={`lg:hidden p-2 rounded-lg ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
            <Menu size={20} />
          </button>

          {/* Global search */}
          <div className="flex-1 max-w-md relative" ref={searchRef}>
            <div className="relative">
              <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => searchQuery && setShowSearch(true)}
                placeholder="Search schools, users..."
                className={`w-full pl-9 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${searchBg}`}
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              )}
            </div>

            {/* Search dropdown */}
            {showSearch && (
              <div className={`absolute top-full mt-1 left-0 right-0 ${dropdownBg} border rounded-xl shadow-xl overflow-hidden z-50`}>
                {searchResults.length === 0 && !searchLoading && (
                  <p className={`px-4 py-3 text-sm ${textMuted}`}>No results found</p>
                )}
                {searchResults.map(r => (
                  <button key={r.id + r.type} onClick={() => { navigate(r.href); setShowSearch(false); setSearchQuery(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${dropdownHover} transition-colors`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${r.type === 'school' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {r.type === 'school' ? <School size={13} /> : <Users size={13} />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${textPrimary} truncate`}>{r.label}</p>
                      <p className={`text-xs ${textMuted} truncate`}>{r.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className={`text-xs px-3 py-1 rounded-full ${isDark ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-100'}`}>
            Super Admin
          </span>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
