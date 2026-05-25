import { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, GraduationCap, Users, BookOpen, Calendar,
  Receipt, FileText, Award, Clock, User, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useCurrency } from '../hooks/useCurrency';

export default function ClassDetail() {
  const { id: classId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { formatMoney } = useCurrency();

  const { data: classesData } = useTableData(sid, 'classes');
  const { data: studentsData } = useTableData(sid, 'students');
  const { data: staffData } = useTableData(sid, 'staff');
  const { data: subjectsData } = useTableData(sid, 'subjects');
  const { data: feesData } = useTableData(sid, 'fees');
  const { data: paymentsData } = useTableData(sid, 'payments');
  const { data: examsData } = useTableData(sid, 'exams');
  const { data: examResultsData } = useTableData(sid, 'examResults');
  const { data: timetableData } = useTableData(sid, 'timetable');
  const { data: attendanceData } = useTableData(sid, 'attendance');

  const cls = useMemo(() => (classesData as any[]).find(c => c.id === classId), [classesData, classId]);

  const students = useMemo(
    () => (studentsData as any[]).filter(s => s.classId === classId && s.status !== 'completed'),
    [studentsData, classId]
  );

  const subjects = useMemo(
    () => (subjectsData as any[]).filter(s => s.classId === classId),
    [subjectsData, classId]
  );

  // Teachers assigned to this class via subjects
  const teachers = useMemo(() => {
    const teacherIds = new Set(subjects.map((s: any) => s.teacherId).filter(Boolean));
    // Also include staff whose subjects list contains any subject in this class
    const bySubject = (staffData as any[]).filter(st =>
      (st.subjects || []).some((sn: string) => subjects.find((s: any) => s.name === sn))
    );
    const byId = (staffData as any[]).filter(st => teacherIds.has(st.id));
    const merged = new Map<string, any>();
    [...byId, ...bySubject].forEach(t => merged.set(t.id, t));
    return Array.from(merged.values());
  }, [staffData, subjects]);

  // Finance
  const studentIds = useMemo(() => new Set(students.map((s: any) => s.id)), [students]);
  const classFees = useMemo(() => (feesData as any[]).filter(f => studentIds.has(f.studentId)), [feesData, studentIds]);
  const classPayments = useMemo(() => (paymentsData as any[]).filter(p => studentIds.has(p.studentId)), [paymentsData, studentIds]);
  const totalInvoiced = useMemo(() => classFees.reduce((s: number, f: any) => s + (f.amount || 0), 0), [classFees]);
  const totalPaid = useMemo(() => classPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0), [classPayments]);
  const totalBalance = totalInvoiced - totalPaid;

  // Exams
  const classExams = useMemo(() => (examsData as any[]).filter(e => e.classId === classId), [examsData, classId]);

  // Timetable
  const classTimetable = useMemo(() => (timetableData as any[]).filter(t => t.classId === classId), [timetableData, classId]);

  // Attendance summary
  const attendanceSummary = useMemo(() => {
    const records = (attendanceData as any[]).filter(a => studentIds.has(a.entityId));
    const present = records.filter(a => a.status === 'present').length;
    const total = records.length;
    return { present, total, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
  }, [attendanceData, studentIds]);

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  if (!cls) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <GraduationCap size={48} className="text-slate-300" />
        <p className="text-slate-500 font-medium">Class not found</p>
        <button onClick={() => navigate('/classes')} className="btn btn-secondary">Back to Classes</button>
      </div>
    );
  }

  const enrolled = students.length;
  const pct = cls.capacity > 0 ? Math.round((enrolled / cls.capacity) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/classes')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{cls.name}</h1>
            {cls.stream && <span className="badge badge-info">Stream {cls.stream}</span>}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Level {cls.level} · Class overview</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Students', value: enrolled, sub: `of ${cls.capacity} capacity`, icon: <Users size={20} />, color: 'bg-sky-500' },
          { label: 'Teachers', value: teachers.length, sub: 'assigned', icon: <User size={20} />, color: 'bg-violet-500' },
          { label: 'Subjects', value: subjects.length, sub: 'subjects', icon: <BookOpen size={20} />, color: 'bg-emerald-500' },
          { label: 'Attendance', value: `${attendanceSummary.rate}%`, sub: `${attendanceSummary.present}/${attendanceSummary.total} present`, icon: <Calendar size={20} />, color: 'bg-amber-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center text-white shrink-0`}>
                {stat.icon}
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-slate-800 dark:text-white leading-none">{stat.value}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Enrollment bar */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enrollment</span>
          <span className="text-sm text-slate-500">{enrolled}/{cls.capacity} ({pct}%)</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Students */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-sky-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Students ({enrolled})</h2>
            </div>
            <Link to={`/students?class=${classId}`} className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50 max-h-64 overflow-y-auto">
            {students.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">No students enrolled</p>
            ) : students.slice(0, 20).map((s: any, index: number) => (
              <Link key={s.id} to={`/students/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{index + 1}</span>
                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{s.firstName?.[0]}{s.lastName?.[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{s.firstName} {s.lastName}</p>
                  <p className="text-xs text-slate-400 truncate">{s.admissionNo || s.studentId}</p>
                </div>
                <span className={`badge text-[10px] ${s.gender === 'female' ? 'badge-violet' : 'badge-info'}`}>{s.gender}</span>
              </Link>
            ))}
            {students.length > 20 && (
              <div className="px-5 py-2 text-xs text-slate-400 text-center">+{students.length - 20} more</div>
            )}
          </div>
        </div>

        {/* Subjects */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-emerald-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Subjects ({subjects.length})</h2>
            </div>
            <Link to="/subjects" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
              Manage <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50 max-h-64 overflow-y-auto">
            {subjects.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">No subjects assigned</p>
            ) : subjects.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <BookOpen size={13} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{s.name}</p>
                </div>
                {s.code && <span className="font-mono text-xs text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{s.code}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Teachers */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <User size={18} className="text-violet-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Teachers ({teachers.length})</h2>
            </div>
            <Link to="/staff" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
              View staff <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50 max-h-48 overflow-y-auto">
            {teachers.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">No teachers assigned</p>
            ) : teachers.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-violet-600 dark:text-violet-400">{t.firstName?.[0]}{t.lastName?.[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{t.firstName} {t.lastName}</p>
                  <p className="text-xs text-slate-400 capitalize">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Finance summary */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Receipt size={18} className="text-amber-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Fees & Finance</h2>
            </div>
            <Link to="/finance" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
              View finance <ChevronRight size={12} />
            </Link>
          </div>
          <div className="p-5 space-y-3">
            {[
              { label: 'Total Invoiced', value: formatMoney(totalInvoiced), color: 'text-slate-800 dark:text-white' },
              { label: 'Total Paid', value: formatMoney(totalPaid), color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Outstanding', value: formatMoney(totalBalance), color: totalBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{row.label}</span>
                <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
              </div>
            ))}
            {totalInvoiced > 0 && (
              <div className="pt-1">
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, Math.round((totalPaid / totalInvoiced) * 100))}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1 text-right">{Math.round((totalPaid / totalInvoiced) * 100)}% collected</p>
              </div>
            )}
          </div>
        </div>

        {/* Exams */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Award size={18} className="text-rose-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Exams ({classExams.length})</h2>
            </div>
            <Link to="/grades" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
              View grades <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50 max-h-48 overflow-y-auto">
            {classExams.length === 0 ? (
              <p className="text-center text-slate-400 py-8 text-sm">No exams recorded</p>
            ) : classExams.map((e: any) => {
              const results = (examResultsData as any[]).filter(r => r.examId === e.id);
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                    <Award size={13} className="text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{e.name}</p>
                    <p className="text-xs text-slate-400">Term {e.term} · {results.length} results</p>
                  </div>
                  <Link to={`/exam-marks`} className="text-xs text-indigo-500 hover:underline">Marks</Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timetable */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-indigo-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Timetable ({classTimetable.length} periods)</h2>
            </div>
            <Link to="/classes" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
              Edit <ChevronRight size={12} />
            </Link>
          </div>
          <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
            {classTimetable.length === 0 ? (
              <p className="text-center text-slate-400 py-6 text-sm">No timetable set</p>
            ) : DAYS.map((day, di) => {
              const periods = classTimetable.filter((t: any) => String(t.dayOfWeek) === String(di + 1));
              if (periods.length === 0) return null;
              return (
                <div key={day}>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{day}</p>
                  <div className="space-y-1">
                    {periods.map((t: any) => {
                      const sub = (subjectsData as any[]).find(s => s.id === t.subjectId);
                      const teacher = (staffData as any[]).find(s => s.id === t.teacherId);
                      return (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs">
                          <span className="text-slate-400 w-20 shrink-0">{t.startTime}–{t.endTime}</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{sub?.name || '—'}</span>
                          {teacher && <span className="text-slate-400 truncate">{teacher.firstName} {teacher.lastName}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Report cards quick link */}
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 rounded-2xl p-5 border border-indigo-100 dark:border-indigo-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-800 dark:text-white">Report Cards</p>
            <p className="text-xs text-slate-500">Generate report cards for all {enrolled} students in {cls.name}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {students.slice(0, 3).map((s: any) => (
            <Link key={s.id} to={`/report-card/${s.id}`} className="btn btn-secondary text-xs py-1.5 px-3">
              {s.firstName}
            </Link>
          ))}
          {students.length > 3 && (
            <Link to={`/grades?class=${classId}`} className="btn btn-primary text-xs py-1.5 px-3">
              All Reports
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
