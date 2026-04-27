import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Users, BookOpen, LayoutDashboard, Calendar, Receipt, FileBarChart, Bus, MessageSquare, ClipboardList, Settings, Award, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { userDBManager } from '../lib/database/UserDatabaseManager';
import { getClassDisplayName } from '../utils/classroom';

interface SearchResult {
  id: string;
  type: 'student' | 'staff' | 'subject' | 'class' | 'fee' | 'announcement' | 'page';
  title: string;
  subtitle: string;
  link: string;
  image?: string;
}

const pages = [
  { path: '/', title: 'Dashboard', subtitle: 'Main dashboard', icon: LayoutDashboard, keywords: ['home', 'dashboard', 'overview', 'stats'] },
  { path: '/students', title: 'Students', subtitle: 'Manage students', icon: GraduationCap, keywords: ['students', 'pupils', 'enrollment', 'learners'] },
  { path: '/admission', title: 'Admission', subtitle: 'New student registration', icon: UserPlus, keywords: ['admission', 'register', 'enroll', 'new student'] },
  { path: '/staff', title: 'Teachers & Staff', subtitle: 'Manage staff members', icon: Users, keywords: ['staff', 'teachers', 'employees', 'faculty'] },
  { path: '/classes', title: 'Classes', subtitle: 'Manage classes', icon: BookOpen, keywords: ['classes', 'classrooms', 'grades', 'streams'] },
  { path: '/attendance', title: 'Attendance', subtitle: 'Track attendance', icon: Calendar, keywords: ['attendance', 'present', 'absent', 'mark'] },
  { path: '/subjects', title: 'Subjects', subtitle: 'Manage subjects', icon: BookOpen, keywords: ['subjects', 'subject', 'subjects', 'courses'] },
  { path: '/grades', title: 'Exams & Grades', subtitle: 'Manage exams and grades', icon: Award, keywords: ['exams', 'grades', 'results', 'marks', 'scores'] },
  { path: '/finance', title: 'Fees & Finance', subtitle: 'Financial management', icon: Receipt, keywords: ['finance', 'fees', 'payments', 'money'] },
  { path: '/invoices', title: 'Invoices', subtitle: 'View invoices', icon: FileBarChart, keywords: ['invoices', 'billing', 'receipts'] },
  { path: '/transport', title: 'Transport', subtitle: 'Transport management', icon: Bus, keywords: ['transport', 'bus', 'transportation', 'routes'] },
  { path: '/announcements', title: 'Announcements', subtitle: 'School announcements', icon: MessageSquare, keywords: ['announcements', 'news', 'notices', 'events'] },
  { path: '/reports', title: 'Reports', subtitle: 'View reports', icon: ClipboardList, keywords: ['reports', 'analytics', 'statistics'] },
  { path: '/settings', title: 'Settings', subtitle: 'System settings', icon: Settings, keywords: ['settings', 'preferences', 'config'] },
];

export default function GlobalSearch() {
  const { user, schoolId } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const searchRequestId = useRef(0);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setSelectedIndex(-1);
      setLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchData(query);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('.global-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function searchData(rawQuery: string) {
    const currentRequestId = ++searchRequestId.current;
    setLoading(true);
    const searchTerm = rawQuery.trim().toLowerCase();
    const found: SearchResult[] = [];

    // Search pages
    pages.forEach(page => {
      if (
        (page.title || '').toLowerCase().includes(searchTerm) ||
        (page.subtitle || '').toLowerCase().includes(searchTerm) ||
        page.keywords.some(k => (k || '').includes(searchTerm))
      ) {
        found.push({
          id: page.path,
          type: 'page',
          title: page.title,
          subtitle: page.subtitle,
          link: page.path,
        });
      }
    });

    try {
      const tenantId = schoolId || user?.id;
      if (!tenantId) return;

      const [students, staff, subjects, classes] = await Promise.all([
        userDBManager.getAll(tenantId, 'students'),
        userDBManager.getAll(tenantId, 'staff'),
        userDBManager.getAll(tenantId, 'subjects'),
        userDBManager.getAll(tenantId, 'classes'),
      ]);

      students
        .filter(s => 
          (s.firstName || '').toLowerCase().includes(searchTerm) ||
          (s.lastName || '').toLowerCase().includes(searchTerm) ||
          (s.admissionNo || '').toLowerCase().includes(searchTerm)
        )
        .slice(0, 3)
        .forEach(s => {
          found.push({
            id: s.id,
            type: 'student',
            title: `${s.firstName} ${s.lastName}`,
            subtitle: `${s.admissionNo} - ${getClassDisplayName(s.classId, classes)}`,
            link: `/students/${s.id}`,
            image: s.photoUrl || undefined,
          });
        });

      staff
        .filter(s => 
          (s.firstName || '').toLowerCase().includes(searchTerm) ||
          (s.lastName || '').toLowerCase().includes(searchTerm) ||
          (s.employeeId || '').toLowerCase().includes(searchTerm)
        )
        .slice(0, 3)
        .forEach(s => {
          found.push({
            id: s.id,
            type: 'staff',
            title: `${s.firstName} ${s.lastName}`,
            subtitle: `${s.employeeId} - ${s.role}`,
            link: `/staff/${s.id}`,
            image: s.photoUrl || undefined,
          });
        });

      subjects
        .filter(s => (s.name || '').toLowerCase().includes(searchTerm) || (s.code || '').toLowerCase().includes(searchTerm))
        .slice(0, 2)
        .forEach(s => {
          found.push({
            id: s.id,
            type: 'subject',
            title: s.name,
            subtitle: `${s.code} - ${getClassDisplayName(s.classId, classes)}`,
            link: '/subjects',
          });
        });

      classes
        .filter(c => (c.name || '').toLowerCase().includes(searchTerm))
        .slice(0, 2)
        .forEach(c => {
          found.push({
            id: c.id,
            type: 'class',
            title: c.name,
            subtitle: `Level ${c.level}`,
            link: '/classes',
          });
        });

      if (currentRequestId === searchRequestId.current) {
        setResults(found.slice(0, 10));
        setSelectedIndex(-1);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      if (currentRequestId === searchRequestId.current) {
        setLoading(false);
      }
    }
  }

  function handleSelect(result: SearchResult) {
    navigate(result.link);
    setQuery('');
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
    }
  }

  function getTypeBadgeClass(type: string) {
    const badges: Record<string, string> = {
      student: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      staff: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      subject: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
      class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      page: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    };
    return badges[type] || 'bg-slate-100 text-slate-700';
  }

  function getIcon(result: SearchResult) {
    if (result.type === 'page') {
      const page = pages.find(p => p.path === result.id);
      return page?.icon || LayoutDashboard;
    }
    switch (result.type) {
      case 'student': return GraduationCap;
      case 'staff': return Users;
      case 'subject': return BookOpen;
      case 'class': return Users;
      default: return BookOpen;
    }
  }

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search records, students, teachers..."
          className="global-search-input w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-full text-slate-800 dark:text-white placeholder-slate-400 transition-all"
        />
        <kbd className="absolute right-4 px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-600 text-slate-500 dark:text-slate-300 rounded-lg shadow-sm border border-slate-200 dark:border-slate-500 pointer-events-none">
          Ctrl+K
        </kbd>
      </div>

      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden z-50">
          <div className="py-1">
            {results.map((result, index) => {
              const Icon = getIcon(result);
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 transition-all ${
                    selectedIndex === index 
                      ? 'bg-slate-200 dark:bg-slate-600' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-700/70'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden transition-colors ${
                    selectedIndex === index 
                      ? 'bg-white/20 dark:bg-white/10' 
                      : 'bg-slate-100 dark:bg-slate-600'
                  }`}>
                    {result.image ? (
                      <img src={result.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icon size={16} className={selectedIndex === index ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-300'} />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className={`font-semibold text-sm transition-colors ${selectedIndex === index ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-white'}`}>
                      {result.title}
                    </p>
                    <p className={`text-xs ${selectedIndex === index ? 'text-indigo-500/80 dark:text-indigo-300/80' : 'text-slate-500'}`}>
                      {result.subtitle}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${getTypeBadgeClass(result.type)} ${selectedIndex === index ? 'ring-2 ring-indigo-500/30' : ''}`}>
                    {result.type}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200/50 dark:border-slate-700/50 p-4 z-50">
          <p className="text-center text-slate-500 text-sm">No results found</p>
        </div>
      )}
    </div>
  );
}
