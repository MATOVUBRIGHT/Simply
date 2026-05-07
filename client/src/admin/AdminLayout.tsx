import { ReactNode, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, School, Users, LogOut, Menu, X, Shield,
  Sun, Moon, ClipboardCheck, BarChart2, ShieldAlert, Search,
} from 'lucide-react';
import { useAdminAuth } from './AdminAuthContext';
import { useAdminTheme } from './AdminThemeContext';
import { supabase } from '../lib/supabase';

const navItems = [
  { to: '/admin/dashboard',     icon: LayoutDashboard, label: 'Dashboard',      color: 'text-indigo-400' },
  { to: '/admin/schools',       icon: School,          label: 'Schools',         color: 'text-blue-400' },
  { to: '/admin/users',         icon: Users,           label: 'Users',           color: 'text-violet-400' },
  { to: '/admin/verifications', icon: ClipboardCheck,  label: 'Verifications',   color: 'text-amber-400' },
  { to: '/admin/analytics',     icon: BarChart2,       label: 'Analytics',       color: 'text-cyan-400' },
  { to: '/admin/security',      icon: ShieldAlert,     label: 'Security',        color: 'text-rose-400' },
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
  const { isDark, toggle, t } = useAdminTheme();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchRef  = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
        (usersRes.data || []).forEach((u: any) => results.push({
          type: 'user', id: u.id,
          label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          sub: u.email,
          href: `/admin/schools/${u.school_id || u.id}`,
        }));
        (settingsRes.data || []).forEach((s: any) => results.push({
          type: 'school', id: s.school_id,
          label: String(s.value), sub: s.school_id,
          href: `/admin/schools/${s.school_id}`,
        }));
        setSearchResults(results);
      } finally { setSearchLoading(false); }
    }, 300);
  }

  const handleLogout = () => { logout(); navigate('/admin/login'); };

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} flex`}>
      {/* ── Sidebar ── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 ${t.sidebarBg} border-r flex flex-col transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:flex`}>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-5 py-5 border-b ${t.border}`}>
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/30">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <p className={`text-sm font-bold ${t.text}`}>Schofy Admin</p>
            <p className={`text-xs ${t.muted}`}>Super Admin Portal</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className={`ml-auto lg:hidden p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, color }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                  isActive ? t.navActive : t.navInactive
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} className={isActive ? 'text-white' : color} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className={`px-3 py-4 border-t ${t.border} space-y-1`}>
          {/* Theme toggle */}
          <button onClick={toggle}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-indigo-50'
            }`}
          >
            {isDark
              ? <><Sun size={17} className="text-amber-400" /><span>Light Mode</span></>
              : <><Moon size={17} className="text-indigo-500" /><span>Dark Mode</span></>
            }
          </button>

          {/* Admin info */}
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-indigo-50'}`}>
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">SA</div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${t.text} truncate`}>{admin?.name}</p>
              <p className={`text-xs ${t.muted} truncate`}>{admin?.email}</p>
            </div>
          </div>

          <button onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/20' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'
            }`}
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

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className={`sticky top-0 z-30 ${t.headerBg} border-b px-4 py-3 flex items-center gap-3`}>
          <button onClick={() => setSidebarOpen(true)} className={`lg:hidden p-2 rounded-lg ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
            <Menu size={20} />
          </button>

          {/* Global search */}
          <div className="flex-1 max-w-md relative" ref={searchRef}>
            <div className="relative">
              <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.muted}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => searchQuery && setShowSearch(true)}
                placeholder="Search schools, users..."
                className={`w-full pl-9 pr-4 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all ${t.input}`}
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              )}
            </div>

            {showSearch && (
              <div className={`absolute top-full mt-1 left-0 right-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-xl'} border rounded-xl overflow-hidden z-50`}>
                {searchResults.length === 0 && !searchLoading && (
                  <p className={`px-4 py-3 text-sm ${t.muted}`}>No results found</p>
                )}
                {searchResults.map(r => (
                  <button key={r.id + r.type}
                    onClick={() => { navigate(r.href); setShowSearch(false); setSearchQuery(''); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isDark ? 'hover:bg-slate-700' : 'hover:bg-indigo-50'}`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      r.type === 'school' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {r.type === 'school' ? <School size={13} /> : <Users size={13} />}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${t.text} truncate`}>{r.label}</p>
                      <p className={`text-xs ${t.muted} truncate`}>{r.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`text-xs px-3 py-1.5 rounded-full font-medium ${isDark ? 'text-indigo-300 bg-indigo-900/40 border border-indigo-800' : 'text-indigo-700 bg-indigo-50 border border-indigo-200'}`}>
            Super Admin
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
