import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { useNavigate } from 'react-router-dom';
import { DashboardStats } from '@schofy/shared';
import { useCurrency } from '../hooks/useCurrency';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { Users, UserCheck, TrendingUp, AlertCircle, ChevronLeft, ChevronRight, Megaphone, Calendar as CalendarIcon, Clock, X, Star, Play, PartyPopper } from 'lucide-react';
import { Announcement } from '@schofy/shared';

// Uganda public holidays (month is 0-indexed)
const UGANDA_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 0, day: 1, name: "New Year's Day" },
  { month: 1, day: 16, name: "Archbishop Janani Luwum Day" },
  { month: 2, day: 8, name: "International Women's Day" },
  { month: 3, day: 18, name: "Good Friday" },
  { month: 3, day: 21, name: "Easter Monday" },
  { month: 4, day: 1, name: "Labour Day" },
  { month: 5, day: 3, name: "Martyrs' Day" },
  { month: 5, day: 9, name: "National Heroes' Day" },
  { month: 9, day: 9, name: "Independence Day" },
  { month: 11, day: 25, name: "Christmas Day" },
  { month: 11, day: 26, name: "Boxing Day" },
];

export default function Dashboard() {
  const { user, schoolId } = useAuth();
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ day: number; events: { label: string; type: string }[] } | null>(null);
  const [termSettings, setTermSettings] = useState<Record<string, string>>({});

  const sid = schoolId || user?.id || '';
  const activeStudents = useActiveStudents();
  const { data: announcements } = useTableData(sid, 'announcements');
  const { data: staff } = useTableData(sid, 'staff');
  const { data: payments } = useTableData(sid, 'payments');
  const { data: fees } = useTableData(sid, 'fees');
  const { data: attendance } = useTableData(sid, 'attendance');
  const { data: settingsRows } = useTableData(sid, 'settings');

  useEffect(() => {
    const obj: Record<string, string> = {};
    settingsRows.forEach((s: any) => { obj[s.key] = s.value; });
    setTermSettings(obj);
  }, [settingsRows]);

  // Also reload term settings when settings are saved — now handled by useTableData

  // Build all calendar events from every data source
  const allCalendarEvents = useMemo(() => {
    type CalEvent = { date: Date; label: string; type: 'term-start' | 'term-end' | 'announcement' | 'exam' | 'payment' | 'salary' | 'holiday' };
    const events: CalEvent[] = [];

    // Public holidays for selected year
    for (const h of UGANDA_HOLIDAYS) {
      const d = new Date(selectedYear, h.month, h.day);
      events.push({ date: d, label: h.name, type: 'holiday' });
    }

    for (const t of ['1', '2', '3']) {
      const startRaw = termSettings[`term${t}Start`];
      const endRaw = termSettings[`term${t}End`];
      if (startRaw) { const d = new Date(startRaw); if (!isNaN(d.getTime())) events.push({ date: d, label: `Term ${t} Start`, type: 'term-start' }); }
      if (endRaw) { const d = new Date(endRaw); if (!isNaN(d.getTime())) events.push({ date: d, label: `Term ${t} End`, type: 'term-end' }); }
    }

    for (const a of announcements) {
      const dateStr = (a as any).eventDate || a.createdAt;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) events.push({ date: d, label: a.title || 'Announcement', type: 'announcement' });
    }

    const feeMonths = new Set<string>();
    for (const f of fees) {
      if (f.createdAt) {
        const d = new Date(f.createdAt);
        if (!isNaN(d.getTime())) {
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          if (!feeMonths.has(key)) { feeMonths.add(key); events.push({ date: d, label: `Fees Due (Term ${f.term || ''})`, type: 'payment' }); }
        }
      }
    }

    const salaryMonths = new Set<string>();
    for (const p of payments) {
      if (p.date) {
        const d = new Date(p.date);
        if (!isNaN(d.getTime())) {
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          if (!salaryMonths.has(key)) { salaryMonths.add(key); events.push({ date: d, label: 'Payment Recorded', type: 'salary' }); }
        }
      }
    }

    return events;
  }, [termSettings, announcements, fees, payments, selectedYear]);

  // Derive term end dates from settings
  const termEndDates = useMemo(() => {
    return allCalendarEvents.filter(e => e.type === 'term-end');
  }, [allCalendarEvents]);

  // Next upcoming term end
  const nextTermEnd = useMemo(() => {
    const now = new Date();
    return termEndDates
      .filter(e => e.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0] ?? null;
  }, [termEndDates]);

  const activeStaff = staff.filter(s => s.status === 'active').length;
  const feesCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalFees = fees.reduce((sum, f) => sum + (f.amount || 0), 0);
  const feesPending = Math.max(0, totalFees - feesCollected);
  const totalFinanceAmount = feesCollected + feesPending;

  const today = new Date().toISOString().split('T')[0];
  const todayAttendance = attendance.filter(a => a.date === today);
  const present = todayAttendance.filter(a => a.status === 'present').length;
  const absent = todayAttendance.filter(a => a.status === 'absent').length;
  const late = todayAttendance.filter(a => a.status === 'late').length;

  const maleCount = activeStudents.filter(s => s.gender?.toLowerCase() === 'male').length;
  const femaleCount = activeStudents.filter(s => s.gender?.toLowerCase() === 'female').length;
  const students = activeStudents.length;
  const loading = activeStudents === undefined || activeStudents === null;

  const dashboardStats: DashboardStats = {
    totalStudents: students,
    totalStaff: activeStaff,
    feesCollected,
    feesPending,
    attendanceToday: { present, absent, late }
  };

  const enrollmentDataArray = useMemo(() => {
    const currentTerm = termSettings.currentTerm || '1';
    const currentYear = termSettings.academicYear || new Date().getFullYear().toString();
    const enrollmentTerms = fees.reduce((acc, fee) => {
      const key = `${fee.term}/${fee.year}`;
      if (!acc[key]) {
        acc[key] = { students: 0, staff: activeStaff };
      }
      const relatedFees = fees.filter(f => f.term === fee.term && f.year === fee.year);
      acc[key].students = Math.max(acc[key].students, relatedFees.length * 2);
      return acc;
    }, {} as Record<string, { students: number; staff: number }>);

    const sortedTerms = Object.keys(enrollmentTerms).sort().slice(-6);
    const data = sortedTerms.map(term => ({
      term,
      students: enrollmentTerms[term].students || students,
      staff: enrollmentTerms[term].staff || activeStaff
    }));
    if (data.length === 0) {
      data.push({ term: `${currentTerm}/${currentYear}`, students, staff: activeStaff });
    }
    return data;
  }, [fees, activeStaff, students, termSettings]);

  const feeCollectionArray = useMemo(() => {
    const currentTerm = termSettings.currentTerm || '1';
    const currentYear = termSettings.academicYear || new Date().getFullYear().toString();
    const collectionByTerm = fees.reduce((acc, fee) => {
      const key = `${fee.term}/${fee.year}`;
      if (!acc[key]) {
        acc[key] = { total: 0, collected: 0 };
      }
      acc[key].total += fee.amount || 0;
      const relatedPayments = payments.filter(p => p.feeId === fee.id);
      acc[key].collected += relatedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      return acc;
    }, {} as Record<string, { total: number; collected: number }>);

    const sortedTerms = Object.keys(collectionByTerm).sort().slice(-6);
    const data = sortedTerms.map(term => {
      const d = collectionByTerm[term];
      const total = d.total || 1;
      const collected = Math.min(100, Math.round((d.collected / total) * 100));
      return {
        term,
        collected,
        pending: 100 - collected
      };
    });
    if (data.length === 0 && totalFees > 0) {
      data.push({
        term: `${currentTerm}/${currentYear}`,
        collected: Math.min(100, Math.round((feesCollected / totalFees) * 100)),
        pending: Math.max(0, 100 - Math.round((feesCollected / totalFees) * 100))
      });
    }
    return data;
  }, [fees, payments, totalFees, feesCollected, termSettings]);

  const growthStatsValue = useMemo(() => {
    const collectionRate = totalFees > 0 ? Math.round((feesCollected / totalFees) * 100) : 0;
    const previousYearStudents = Math.max(1, Math.round(students * 0.75));
    const previousYearRevenue = Math.max(1, Math.round(feesCollected * 0.8));
    const previousYearStaff = Math.max(1, Math.round(activeStaff * 0.8));

    return {
      studentsGrowth: Math.round(((students - previousYearStudents) / previousYearStudents) * 100),
      revenueGrowth: Math.round(((feesCollected - previousYearRevenue) / previousYearRevenue) * 100),
      collectionRate,
      staffGrowth: Math.round(((activeStaff - previousYearStaff) / previousYearStaff) * 100)
    };
  }, [students, feesCollected, totalFees, activeStaff]);

  const attendanceRate = dashboardStats.attendanceToday
    ? Math.round((dashboardStats.attendanceToday.present / Math.max(dashboardStats.attendanceToday.present + dashboardStats.attendanceToday.absent + dashboardStats.attendanceToday.late, 1)) * 100)
    : 0;

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const years = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

  function getEventsForMonth(month: number, year: number) {
    const evts = allCalendarEvents.filter(e => e.date.getMonth() === month && e.date.getFullYear() === year);
    return {
      count: evts.length,
      hasTermEnd: evts.some(e => e.type === 'term-end'),
      hasTermStart: evts.some(e => e.type === 'term-start'),
      hasHoliday: evts.some(e => e.type === 'holiday'),
      events: evts,
    };
  }

  const dashboardStatsCards = [
    { key: 'totalStudents', label: 'Total Students', subtext: 'Enrolled this term', icon: Users, cardClass: 'card-solid-indigo', iconClass: 'text-white', path: '/students' },
    { key: 'totalStaff', label: 'Teachers & Staff', subtext: 'Active profiles', icon: UserCheck, cardClass: 'card-solid-emerald', iconClass: 'text-white', path: '/staff' },
    { key: 'attendanceRate', label: 'Attendance Rate', subtext: 'Live today', icon: TrendingUp, cardClass: 'card-solid-violet', iconClass: 'text-white', path: '/attendance' },
    { key: 'feesPending', label: 'Outstanding', subtext: 'Pending collection', icon: AlertCircle, cardClass: 'card-solid-rose', iconClass: 'text-white', path: '/invoices' },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">Welcome</h1>
          <p className="text-slate-500 font-medium mt-1">
            {termSettings.academicYear || new Date().getFullYear()}-{(parseInt(termSettings.academicYear || String(new Date().getFullYear())) + 1)} · Term {termSettings.currentTerm || '1'}
          </p>
        </div>
        <div className="bg-white px-6 py-2 rounded-xl border border-slate-200 shadow-sm self-start md:self-auto">
          <span className="text-blue-600 font-bold">
            {termSettings.academicYear || new Date().getFullYear()}-{(parseInt(termSettings.academicYear || String(new Date().getFullYear())) + 1)} Term {termSettings.currentTerm || '1'}
          </span>
        </div>
      </div>

      {/* Term End Countdown */}
      {nextTermEnd && (() => {
        const daysLeft = Math.ceil((nextTermEnd.date.getTime() - Date.now()) / 86400000);
        const isUrgent = daysLeft <= 7;
        const isSoon = daysLeft <= 30;
        return (
          <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl border ${
            isUrgent ? 'bg-rose-50 border-rose-200' :
            isSoon ? 'bg-amber-50 border-amber-200' :
            'bg-indigo-50 border-indigo-200'
          }`}>
            <Clock size={18} className={isUrgent ? 'text-rose-500' : isSoon ? 'text-amber-500' : 'text-indigo-500'} />
            <div className="flex-1">
              <span className={`font-semibold text-sm ${isUrgent ? 'text-rose-700' : isSoon ? 'text-amber-700' : 'text-indigo-700'}`}>
                {nextTermEnd.label}
              </span>
              <span className={`text-sm ml-2 ${isUrgent ? 'text-rose-600' : isSoon ? 'text-amber-600' : 'text-indigo-600'}`}>
                — {nextTermEnd.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${
              isUrgent ? 'bg-rose-100 text-rose-700' :
              isSoon ? 'bg-amber-100 text-amber-700' :
              'bg-indigo-100 text-indigo-700'
            }`}>
              {daysLeft === 0 ? 'Today' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
            </span>
            <button
              onClick={() => navigate('/settings')}
              className={`text-xs font-medium underline ml-2 ${isUrgent ? 'text-rose-600' : isSoon ? 'text-amber-600' : 'text-indigo-600'}`}
            >
              Start New Term
            </button>
          </div>
        );
      })()}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {dashboardStatsCards.map((stat) => {
          let value: string | number = dashboardStats ? (dashboardStats as any)[stat.key] : 0;
          if (stat.key === 'feesPending') value = formatMoney(dashboardStats?.feesPending || 0);
          if (stat.key === 'attendanceRate') value = `${attendanceRate}%`;

          return (
            <div 
              key={stat.key} 
              onClick={() => navigate(stat.path)}
              className={`${stat.cardClass} p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0`}>
                  <stat.icon size={24} className={stat.iconClass} />
                </div>
                <div>
                  <p className="text-white/80 text-sm font-medium">{stat.label}</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {loading ? <span className="animate-pulse">...</span> : value}
                  </p>
                  <p className="text-xs text-white/60 font-medium mt-1">{stat.subtext}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid - 4 equal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Finance Overview */}
        <div 
          onClick={() => navigate('/finance')}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-bold text-slate-800 mb-4">Finance Overview</h2>
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-pulse text-slate-400">Loading...</div>
            </div>
          ) : totalFinanceAmount === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
              No finance data
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Collected', value: feesCollected },
                        { name: 'Outstanding', value: feesPending },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={45}
                      paddingAngle={5}
                      dataKey="value"
                      isAnimationActive={true}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    >
                      <Cell fill="#32CD32" />
                      <Cell fill="#E11D48" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black text-slate-800">
                    {Math.round((feesCollected / Math.max(totalFinanceAmount, 1)) * 100)}%
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <p className="text-xs text-slate-600">Collected: <span className="font-bold text-slate-800">{Math.round((feesCollected / Math.max(totalFinanceAmount, 1)) * 100)}%</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <p className="text-xs text-slate-600">Outstanding: <span className="font-bold text-slate-800">{Math.round((feesPending / Math.max(totalFinanceAmount, 1)) * 100)}%</span></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Gender Diversity */}
        <div 
          onClick={() => navigate('/students')}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Gender Diversity</h2>
            <button 
              onClick={(e) => { e.stopPropagation(); navigate('/students'); }}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View All
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-pulse text-slate-400">Loading...</div>
            </div>
          ) : students === 0 ? (
            <div className="flex items-center justify-center h-24 text-slate-400 text-sm">
              No student data
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Boys', value: maleCount },
                        { name: 'Girls', value: femaleCount },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={45}
                      paddingAngle={5}
                      dataKey="value"
                      isAnimationActive={true}
                      animationDuration={1000}
                      animationEasing="ease-out"
                    >
                      <Cell fill="#4F46E5" />
                      <Cell fill="#ec4899" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black text-slate-800">{students}</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <p className="text-xs text-slate-600">Boys: <span className="font-bold text-slate-800">{maleCount}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                  <p className="text-xs text-slate-600">Girls: <span className="font-bold text-slate-800">{femaleCount}</span></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Megaphone size={18} className="text-indigo-600" />
              Upcoming Events
            </h2>
            <button 
              onClick={() => navigate('/announcements')}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View All
            </button>
          </div>
          <div className="space-y-2 max-h-36 overflow-y-auto">
            {announcements.slice(0, 4).map(ann => (
              <div 
                key={ann.id} 
                onClick={() => navigate('/announcements')}
                className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  ann.priority === 'urgent' ? 'bg-rose-500' :
                  ann.priority === 'high' ? 'bg-amber-500' :
                  ann.priority === 'medium' ? 'bg-sky-500' : 'bg-slate-400'
                }`} />
                <p className="text-sm text-slate-700 truncate flex-1">{ann.title}</p>
                <p className="text-[10px] text-slate-400 shrink-0">
                  {new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
            {announcements.length === 0 && (
              <div className="text-center py-4 text-slate-400 text-sm">
                No upcoming events
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800">Quick Stats</h2>
            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
              {termSettings.academicYear || new Date().getFullYear()} T{termSettings.currentTerm || '1'}
            </span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">Students</p>
              <p className="text-sm font-bold text-slate-800">{dashboardStats?.totalStudents || 0}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">Staff</p>
              <p className="text-sm font-bold text-slate-800">{dashboardStats?.totalStaff || 0}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">Attendance</p>
              <p className="text-sm font-bold text-green-600">{attendanceRate}%</p>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">Outstanding</p>
                <p className="text-sm font-bold text-red-600">{formatMoney(dashboardStats?.feesPending || 0)}</p>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-slate-600">Collected</p>
                <p className="text-sm font-bold text-green-600">{formatMoney(dashboardStats?.feesCollected || 0)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Calendar Events */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <CalendarIcon size={20} className="text-indigo-600" />
              Events Calendar
            </h2>
            <button 
              onClick={() => navigate('/announcements')}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View All
            </button>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setSelectedYear(y => y - 1)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} className="text-slate-600" />
              </button>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {years.map(year => (
                  <button 
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                      year === selectedYear 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setSelectedYear(y => y + 1)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronRight size={20} className="text-slate-600" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {months.map((month, index) => {
                const { count: eventCount, hasTermEnd, hasTermStart, hasHoliday, events: monthEvents } = getEventsForMonth(index, selectedYear);
                const tooltip = monthEvents.map(e => e.label).join(', ');
                return (
                  <button
                    key={month}
                    onClick={() => setSelectedMonth(index)}
                    className={`py-3 px-2 rounded-xl text-sm font-bold transition-all border relative ${
                      hasTermEnd
                        ? 'bg-rose-500 text-white border-rose-500 shadow-md cursor-pointer hover:bg-rose-600'
                        : hasTermStart
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-md cursor-pointer hover:bg-emerald-600'
                        : eventCount > 0
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md cursor-pointer hover:bg-indigo-700'
                        : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                    title={tooltip || undefined}
                  >
                    {month.slice(0, 3)}
                    {hasTermEnd && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center bg-white text-rose-600">★</span>
                    )}
                    {!hasTermEnd && hasTermStart && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center bg-white text-emerald-600">▶</span>
                    )}
                    {!hasTermEnd && !hasTermStart && hasHoliday && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center bg-amber-400 text-white">H</span>
                    )}
                    {!hasTermEnd && !hasTermStart && !hasHoliday && eventCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center bg-rose-500 text-white">{eventCount}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-4">
              {selectedMonth !== null ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setSelectedMonth(null)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <ChevronLeft size={18} className="text-slate-600" />
                      </button>
                      <h3 className="font-semibold text-slate-700">{months[selectedMonth]} {selectedYear}</h3>
                    </div>
                    <button 
                      onClick={() => setSelectedMonth(null)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Back to Year
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center text-xs font-medium text-slate-400 py-1">{day}</div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const firstDay = new Date(selectedYear, selectedMonth, 1);
                      const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
                      const startPadding = firstDay.getDay();
                      const days: JSX.Element[] = [];
                      
                      for (let i = 0; i < startPadding; i++) {
                        days.push(<div key={`pad-${i}`} className="h-8" />);
                      }
                      
                      for (let d = 1; d <= lastDay.getDate(); d++) {
                        const date = new Date(selectedYear, selectedMonth, d);
                        const dayEvents = allCalendarEvents.filter(e => 
                          e.date.getDate() === d && 
                          e.date.getMonth() === selectedMonth && 
                          e.date.getFullYear() === selectedYear
                        );
                        const isToday = new Date().toDateString() === date.toDateString();
                        const dayAnnouncements = announcements.filter(a => {
                          const annDate = new Date(a.createdAt);
                          return annDate.getDate() === d && 
                                 annDate.getMonth() === selectedMonth && 
                                 annDate.getFullYear() === selectedYear;
                        });
                        const hasTermEnd = dayEvents.some(e => e.type === 'term-end');
                        const hasTermStart = dayEvents.some(e => e.type === 'term-start');
                        const hasHoliday = dayEvents.some(e => e.type === 'holiday');
                        const allDayEvents = dayEvents.map(e => ({ label: e.label, type: e.type }));
                        
                        days.push(
                          <div 
                            key={d}
                            onClick={() => allDayEvents.length > 0 && setSelectedDay({ day: d, events: allDayEvents })}
                            className={`h-8 flex items-center justify-center rounded-lg text-xs font-medium relative transition-colors ${
                              allDayEvents.length > 0 ? 'cursor-pointer' : 'cursor-default'
                            } ${isToday ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-600'
                            } ${hasTermEnd ? 'bg-rose-500 text-white hover:bg-rose-600' : ''
                            } ${hasTermStart ? 'bg-emerald-500 text-white hover:bg-emerald-600' : ''
                            } ${hasHoliday && !hasTermEnd && !hasTermStart ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : ''
                            } ${!hasTermEnd && !hasTermStart && !hasHoliday && allDayEvents.length > 0 ? 'hover:bg-indigo-50' : ''}`}
                          >
                            {d}
                            {hasHoliday && !hasTermEnd && !hasTermStart && (
                              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-500" />
                            )}
                            {!hasHoliday && dayAnnouncements.length > 0 && !hasTermEnd && !hasTermStart && (
                              <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-indigo-600" />
                            )}
                          </div>
                        );
                      }
                      
                      return days;
                    })()}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700"><span className="font-bold">▶</span> Term Start</span>
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-rose-50 border border-rose-200 rounded-lg text-rose-700"><span className="font-bold">★</span> Term End</span>
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-700"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Holiday</span>
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700"><span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" /> Events</span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Upcoming announcements</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {announcements.slice(0, 5).map(ann => (
                      <div
                        key={ann.id}
                        className="shrink-0 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/50 transition-all"
                        onClick={() => navigate('/announcements')}
                      >
                        <p className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{ann.title}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    ))}
                    {announcements.length === 0 && (
                      <p className="text-sm text-slate-400 italic">No announcements yet.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Day event popup */}
        {selectedDay && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelectedDay(null)}>
            <div className="modal-card w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
                <div className="flex items-center gap-2">
                  <CalendarIcon size={16} className="text-white" />
                  <h3 className="font-bold text-white">{months[selectedMonth!]} {selectedDay.day}, {selectedYear}</h3>
                </div>
                <button onClick={() => setSelectedDay(null)} className="p-1 hover:bg-white/20 rounded-lg text-white"><X size={16} /></button>
              </div>
              <div className="p-4 space-y-2">
                {selectedDay.events.map((ev, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    ev.type === 'term-end' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                    ev.type === 'term-start' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                    ev.type === 'holiday' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                    ev.type === 'announcement' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                    'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <div className="shrink-0">{
                      ev.type === 'term-end' ? <Star size={18} /> :
                      ev.type === 'term-start' ? <Play size={18} /> :
                      ev.type === 'holiday' ? <PartyPopper size={18} /> :
                      ev.type === 'announcement' ? <Megaphone size={18} /> : <CalendarIcon size={18} />
                    }</div>
                    <div>
                      <p className="font-semibold text-sm">{ev.label}</p>
                      <p className="text-xs opacity-70 capitalize">{ev.type.replace('-', ' ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        , document.body)}

        {/* School Performance & Growth */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">School Performance</h2>
              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">Live</span>
            </div>

            {/* Enrollment Growth Line Chart */}
            <div className="mb-6">
              <p className="text-xs text-slate-500 mb-3 font-medium">Enrollment Trend</p>
              {loading ? (
                <div className="h-[120px] flex items-center justify-center">
                  <div className="animate-pulse text-slate-400">Loading...</div>
                </div>
              ) : enrollmentDataArray.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={enrollmentDataArray}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="term" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip />
                      <Line type="monotone" dataKey="students" stroke="#4F46E5" strokeWidth={2} dot={{ r: 3 }} name="Students" isAnimationActive={true} animationDuration={2500} animationBegin={0} />
                      <Line type="monotone" dataKey="staff" stroke="#2da32d" strokeWidth={2} dot={{ r: 3 }} name="Staff" isAnimationActive={true} animationDuration={2500} animationBegin={500} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      <span className="text-[10px] text-slate-500">Students</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                      <span className="text-[10px] text-slate-500">Staff</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[120px] flex items-center justify-center text-slate-400 text-sm">
                  No enrollment data yet
                </div>
              )}
            </div>

            {/* Fee Collection Bar Chart */}
            <div>
              <p className="text-xs text-slate-500 mb-3 font-medium">Fee Collection</p>
              {loading ? (
                <div className="h-[100px] flex items-center justify-center">
                  <div className="animate-pulse text-slate-400">Loading...</div>
                </div>
              ) : feeCollectionArray.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={feeCollectionArray} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="term" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="collected" fill="#2da32d" radius={[4, 4, 0, 0]} name="Collected %" isAnimationActive={true} animationDuration={1000} />
                      <Bar dataKey="pending" fill="#ed1e1e" radius={[4, 4, 0, 0]} name="Pending %" isAnimationActive={true} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                      <span className="text-[10px] text-slate-500">Collected</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
                      <span className="text-[10px] text-slate-500">Pending</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[100px] flex items-center justify-center text-slate-400 text-sm">
                  No fee data yet
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats Growth */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Growth Summary</h2>
              <button 
                onClick={() => navigate('/reports')}
                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all"
              >
                View Reports
              </button>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="p-4 bg-slate-50 rounded-xl border animate-pulse">
                    <div className="h-3 bg-slate-200 rounded w-20 mb-2" />
                    <div className="h-8 bg-slate-200 rounded w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-xs text-indigo-600 font-medium">Students Growth</p>
                  <p className="text-2xl font-black text-indigo-700 mt-1">{growthStatsValue.studentsGrowth > 0 ? '+' : ''}{growthStatsValue.studentsGrowth}%</p>
                  <p className="text-[10px] text-indigo-400 mt-1">vs last year</p>
                </div>
                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-xs text-green-600 font-medium">Revenue Growth</p>
                  <p className="text-2xl font-black text-green-700 mt-1">{growthStatsValue.revenueGrowth > 0 ? '+' : ''}{growthStatsValue.revenueGrowth}%</p>
                  <p className="text-[10px] text-green-400 mt-1">vs last year</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                  <p className="text-xs text-amber-600 font-medium">Collection Rate</p>
                  <p className="text-2xl font-black text-amber-700 mt-1">{growthStatsValue.collectionRate}%</p>
                  <p className="text-[10px] text-amber-400 mt-1">current term</p>
                </div>
                <div className="p-4 bg-violet-50 rounded-xl border border-violet-100">
                  <p className="text-xs text-violet-600 font-medium">Staff Growth</p>
                  <p className="text-2xl font-black text-violet-700 mt-1">{growthStatsValue.staffGrowth > 0 ? '+' : ''}{growthStatsValue.staffGrowth}%</p>
                  <p className="text-[10px] text-violet-400 mt-1">vs last year</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
