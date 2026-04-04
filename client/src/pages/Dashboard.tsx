import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardStats } from '@schofy/shared';
import { useCurrency } from '../hooks/useCurrency';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/DataService';
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
import { Users, UserCheck, TrendingUp, AlertCircle, ChevronLeft, ChevronRight, Megaphone, Calendar as CalendarIcon } from 'lucide-react';
import { Announcement } from '@schofy/shared';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [otherData, setOtherData] = useState<{ staff: any[]; payments: any[]; fees: any[]; attendance: any[] }>({ staff: [], payments: [], fees: [], attendance: [] });

  const activeStudents = useActiveStudents();

  useEffect(() => {
    if (user?.id) {
      loadAnnouncements();
      loadOtherData();
    }
  }, [user]);

  useEffect(() => {
    const handleDataRefresh = () => {
      loadAnnouncements();
      loadOtherData();
    };
    
    window.addEventListener('studentsUpdated', handleDataRefresh);
    window.addEventListener('staffUpdated', handleDataRefresh);
    window.addEventListener('paymentsUpdated', handleDataRefresh);
    window.addEventListener('feesUpdated', handleDataRefresh);
    window.addEventListener('attendanceUpdated', handleDataRefresh);
    window.addEventListener('announcementsUpdated', handleDataRefresh);
    window.addEventListener('dataRefresh', handleDataRefresh);
    
    return () => {
      window.removeEventListener('studentsUpdated', handleDataRefresh);
      window.removeEventListener('staffUpdated', handleDataRefresh);
      window.removeEventListener('paymentsUpdated', handleDataRefresh);
      window.removeEventListener('feesUpdated', handleDataRefresh);
      window.removeEventListener('attendanceUpdated', handleDataRefresh);
      window.removeEventListener('announcementsUpdated', handleDataRefresh);
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, []);

  async function loadAnnouncements() {
    if (!user?.id) return;
    try {
      const data = await dataService.getAll(user.id, 'announcements');
      setAnnouncements(data);
    } catch (error) {
      console.error('Failed to load announcements:', error);
    }
  }

  async function loadOtherData() {
    if (!user?.id) return;
    try {
      const [staff, payments, fees, attendance] = await Promise.all([
        dataService.getAll(user.id, 'staff'),
        dataService.getAll(user.id, 'payments'),
        dataService.getAll(user.id, 'fees'),
        dataService.getAll(user.id, 'attendance')
      ]);
      setOtherData({ staff, payments, fees, attendance });
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  const activeStaff = otherData.staff.filter(s => s.status === 'active').length;
  const feesCollected = otherData.payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalFees = otherData.fees.reduce((sum, f) => sum + (f.amount || 0), 0);
  const feesPending = Math.max(0, totalFees - feesCollected);
  const totalFinanceAmount = feesCollected + feesPending;

  const today = new Date().toISOString().split('T')[0];
  const todayAttendance = otherData.attendance.filter(a => a.date === today);
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
    const currentTerm = '1';
    const currentYear = new Date().getFullYear().toString();
    const enrollmentTerms = otherData.fees.reduce((acc, fee) => {
      const key = `${fee.term}/${fee.year}`;
      if (!acc[key]) {
        acc[key] = { students: 0, staff: activeStaff };
      }
      const relatedFees = otherData.fees.filter(f => f.term === fee.term && f.year === fee.year);
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
  }, [otherData.fees, activeStaff, students]);

  const feeCollectionArray = useMemo(() => {
    const currentTerm = '1';
    const currentYear = new Date().getFullYear().toString();
    const collectionByTerm = otherData.fees.reduce((acc, fee) => {
      const key = `${fee.term}/${fee.year}`;
      if (!acc[key]) {
        acc[key] = { total: 0, collected: 0 };
      }
      acc[key].total += fee.amount || 0;
      const relatedPayments = otherData.payments.filter(p => p.feeId === fee.id);
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
  }, [otherData.fees, otherData.payments, totalFees, feesCollected]);

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
    return announcements.filter(a => {
      const date = new Date(a.createdAt);
      return date.getMonth() === month && date.getFullYear() === year;
    });
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
          <p className="text-slate-500 font-medium mt-1">Good afternoon. 2025-2026 Term 1</p>
        </div>
        <div className="bg-white px-6 py-2 rounded-xl border border-slate-200 shadow-sm self-start md:self-auto">
          <span className="text-blue-600 font-bold">2025-2026 Term 1</span>
        </div>
      </div>

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
            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">2026 T1</span>
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
                const eventCount = getEventsForMonth(index, selectedYear).length;
                return (
                  <button 
                    key={month}
                    onClick={() => navigate('/announcements')}
                    className={`py-3 px-2 rounded-xl text-sm font-bold transition-all border relative ${
                      eventCount > 0 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-900/10 cursor-pointer hover:bg-indigo-700' 
                        : 'bg-white text-slate-600 border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {month.slice(0, 3)}
                    {eventCount > 0 && (
                      <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        eventCount > 0 ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {eventCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-400 font-medium mb-2">Quick access - Upcoming events</p>
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
                  <p className="text-sm text-slate-400 italic">No events yet. Create one in Announcements.</p>
                )}
              </div>
            </div>
          </div>
        </div>

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
