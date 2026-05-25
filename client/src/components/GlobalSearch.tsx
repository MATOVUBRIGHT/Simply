import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Users, BookOpen, LayoutDashboard, Calendar, Receipt, FileBarChart, Bus, MessageSquare, ClipboardList, Settings, Award, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { getClassDisplayName } from '../utils/classroom';
import { store } from '../lib/store';
import { matchesStudentSearch } from '../utils/studentSearch';
import { matchesTextSearch } from '../utils/searchMatch';

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
  { path: '/students/new', title: 'Add Student', subtitle: 'Open new student form', icon: UserPlus, keywords: ['add student', 'new student', 'create student', 'student form'] },
  { path: '/students', title: 'Import Students', subtitle: 'Open students page import button', icon: GraduationCap, keywords: ['import students', 'student template', 'excel students', 'csv students', 'upload students'] },
  { path: '/students', title: 'Export Students', subtitle: 'Open students page export button', icon: GraduationCap, keywords: ['export students', 'download students', 'student list'] },
  { path: '/admission', title: 'Admission', subtitle: 'New student registration', icon: UserPlus, keywords: ['admission', 'register', 'enroll', 'new student'] },
  { path: '/staff', title: 'Teachers & Staff', subtitle: 'Manage staff members', icon: Users, keywords: ['staff', 'teachers', 'employees', 'faculty'] },
  { path: '/staff/new', title: 'Add Staff', subtitle: 'Open new staff form', icon: UserPlus, keywords: ['add staff', 'add teacher', 'new teacher', 'new staff', 'staff form'] },
  { path: '/payroll', title: 'Payroll', subtitle: 'Staff salary payments', icon: Receipt, keywords: ['payroll', 'salary', 'staff payments', 'wages'] },
  { path: '/classes', title: 'Classes', subtitle: 'Manage classes', icon: BookOpen, keywords: ['classes', 'classrooms', 'grades', 'streams'] },
  { path: '/classes', title: 'Add Class', subtitle: 'Open classes page actions', icon: BookOpen, keywords: ['add class', 'new class', 'create class', 'class import', 'class template'] },
  { path: '/attendance', title: 'Attendance', subtitle: 'Track attendance', icon: Calendar, keywords: ['attendance', 'present', 'absent', 'mark'] },
  { path: '/attendance', title: 'Import Attendance', subtitle: 'Open attendance import tools', icon: Calendar, keywords: ['import attendance', 'attendance template', 'attendance excel'] },
  { path: '/subjects', title: 'Subjects', subtitle: 'Manage subjects', icon: BookOpen, keywords: ['subjects', 'subject', 'subjects', 'courses'] },
  { path: '/subjects', title: 'Import Subjects', subtitle: 'Open subject import tools', icon: BookOpen, keywords: ['import subjects', 'subject template', 'subject excel'] },
  { path: '/grades', title: 'Exams & Grades', subtitle: 'Manage exams and grades', icon: Award, keywords: ['exams', 'grades', 'results', 'marks', 'scores'] },
  { path: '/exam-marks', title: 'Exam Marks', subtitle: 'Enter and manage exam marks', icon: Award, keywords: ['exam marks', 'marks entry', 'scores', 'results', 'academic marks'] },
  { path: '/report-card/new', title: 'Report Card Template', subtitle: 'Design and print report cards', icon: Award, keywords: ['report card', 'academic document', 'student report card', 'report template'] },
  { path: '/finance', title: 'Fees & Finance', subtitle: 'Financial management', icon: Receipt, keywords: ['finance', 'fees', 'payments', 'money', 'ledger', 'opening balance', 'closing balance'] },
  { path: '/finance', title: 'Finance Students', subtitle: 'Finance student tags and balances', icon: Users, keywords: ['finance students', 'student finance', 'bursary tags', 'discount tags', 'full bursary'] },
  { path: '/finance?tab=ledger', title: 'Ledger', subtitle: 'Student fee ledger and balances', icon: FileBarChart, keywords: ['ledger', 'fee ledger', 'opening balance', 'closing balance', 'student ledger', 'term ledger'] },
  { path: '/finance?tab=invoices', title: 'Finance Invoices', subtitle: 'Finance invoice list', icon: FileBarChart, keywords: ['finance invoices', 'invoice list', 'term invoices', 'student invoices'] },
  { path: '/finance?tab=payments', title: 'Payments', subtitle: 'Record and review payments', icon: Receipt, keywords: ['payments', 'record payment', 'payment history', 'paid fees'] },
  { path: '/finance?tab=payments', title: 'Import Payments', subtitle: 'Open payment import tools', icon: Receipt, keywords: ['import payments', 'payment template', 'payments excel'] },
  { path: '/finance?tab=accounts', title: 'Payment Accounts', subtitle: 'Accounts shown on invoices and reports', icon: Receipt, keywords: ['accounts', 'payment accounts', 'bank accounts', 'mobile money', 'payment details'] },
  { path: '/day-boarding', title: 'Day & Boarding', subtitle: 'Day and boarding students', icon: Users, keywords: ['day', 'boarding', 'boys', 'girls', 'students'] },
  { path: '/day-boarding', title: 'Assign Dormitory / Hostel', subtitle: 'Boarding student dormitory assignment', icon: Users, keywords: ['assign dormitory', 'assign hostel', 'hostel', 'dormitory', 'boarding room'] },
  { path: '/invoices', title: 'Invoices', subtitle: 'View invoices', icon: FileBarChart, keywords: ['invoices', 'billing', 'receipts'] },
  { path: '/invoices', title: 'Student Invoices', subtitle: 'Open student invoice view', icon: FileBarChart, keywords: ['student invoices', 'student invoice', 'invoice student', 'invoice template'] },
  { path: '/invoices', title: 'Invoice Payment Accounts', subtitle: 'Add payment details shown on invoices', icon: Receipt, keywords: ['invoice accounts', 'add payment details', 'invoice payment details', 'bank details on invoice'] },
  { path: '/invoices', title: 'Import Invoices', subtitle: 'Open invoice import tools', icon: FileBarChart, keywords: ['import invoices', 'invoice excel', 'invoice template import'] },
  { path: '/transport', title: 'Transport', subtitle: 'Transport management', icon: Bus, keywords: ['transport', 'bus', 'transportation', 'routes'] },
  { path: '/transport', title: 'Import Transport Routes', subtitle: 'Open transport route import tools', icon: Bus, keywords: ['import transport', 'route template', 'bus route import'] },
  { path: '/announcements', title: 'Announcements', subtitle: 'School announcements', icon: MessageSquare, keywords: ['announcements', 'news', 'notices', 'events'] },
  { path: '/announcements', title: 'Notice Board', subtitle: 'School notices and events', icon: MessageSquare, keywords: ['notice board', 'notice', 'event date', 'broadcast announcement'] },
  { path: '/notifications', title: 'Notifications', subtitle: 'Messages, broadcasts and replies', icon: MessageSquare, keywords: ['notifications', 'messages', 'broadcast', 'reply', 'chat'] },
  { path: '/reports', title: 'Reports', subtitle: 'View reports', icon: ClipboardList, keywords: ['reports', 'analytics', 'statistics'] },
  { path: '/reports', title: 'Term Reports', subtitle: 'Track terms and yearly summaries', icon: ClipboardList, keywords: ['term reports', 'track terms', 'year reports', 'academic documents'] },
  { path: '/reports', title: 'Fees Reports', subtitle: 'Fee, payment, invoice, bursary and discount reports', icon: Receipt, keywords: ['fees report', 'payment report', 'invoice report', 'bursary report', 'discount report'] },
  { path: '/roles', title: 'Roles & Access', subtitle: 'Staff access permissions', icon: Users, keywords: ['roles', 'permissions', 'access', 'staff access'] },
  { path: '/plans', title: 'Plans & Subscription', subtitle: 'Plan status, upgrade and renewal', icon: Receipt, keywords: ['plans', 'subscription', 'upgrade', 'trial', 'billing'] },
  { path: '/recycle-bin', title: 'Recycle Bin', subtitle: 'Restore deleted records', icon: ClipboardList, keywords: ['recycle bin', 'deleted', 'restore', 'trash'] },
  { path: '/settings', title: 'Settings', subtitle: 'System settings', icon: Settings, keywords: ['settings', 'preferences', 'config'] },
  { path: '/settings', title: 'Payment Accounts Settings', subtitle: 'Configure invoice payment accounts', icon: Settings, keywords: ['payment accounts settings', 'bank settings', 'mobile money settings', 'invoice accounts settings'] },
  { path: '/settings', title: 'Cloud Backup', subtitle: 'Backup and sync settings', icon: Settings, keywords: ['cloud backup', 'google drive', 'backup', 'restore backup', 'sync settings'] },
  { path: '/settings', title: 'New Term', subtitle: 'Promote students and start a new term', icon: Settings, keywords: ['new term', 'promote students', 'complete term', 'start term', 'term settings'] },
  { path: '/settings', title: 'School Logo & Info', subtitle: 'School name, logo, currency and details', icon: Settings, keywords: ['school logo', 'school info', 'currency', 'app logo', 'school settings'] },
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
    const searchTerm = rawQuery.trim();
    const found: SearchResult[] = [];

    // Search pages
    pages.forEach(page => {
      if (
        matchesTextSearch([page.title, page.subtitle, ...page.keywords], searchTerm)
      ) {
        found.push({
          id: `${page.path}-${page.title}`,
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

      // Use store cache first (instant), fall back to direct fetch
      const getStoreData = (table: string) => {
        const snap = store.getSnapshot(tenantId, table);
        return snap.data.length > 0 ? snap.data : null;
      };

      // Also try user.id as alternate tenant if schoolId differs
      const altId = user?.id !== tenantId ? user?.id : null;
      const fetchWithFallback = async (table: string) => {
        const cached = getStoreData(table);
        if (cached) return cached;
        const data = await dataService.getAll(tenantId, table);
        if (data.length === 0 && altId) return dataService.getAll(altId, table);
        return data;
      };

      const [students, staff, subjects, classes] = await Promise.all([
        fetchWithFallback('students'),
        fetchWithFallback('staff'),
        fetchWithFallback('subjects'),
        fetchWithFallback('classes'),
      ]);

      students
        .filter(s => matchesStudentSearch(s, searchTerm, [getClassDisplayName(s.classId, classes)]))
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
        .filter(s => matchesTextSearch([s.firstName, s.lastName, `${s.firstName} ${s.lastName}`, `${s.lastName} ${s.firstName}`, s.employeeId, s.role], searchTerm))
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
        .filter(s => matchesTextSearch([s.name, s.code, getClassDisplayName(s.classId, classes)], searchTerm))
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
        .filter(c => matchesTextSearch([c.name, c.level], searchTerm))
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
      const page = pages.find(p => p.path === result.link && p.title === result.title) || pages.find(p => p.path === result.link);
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
