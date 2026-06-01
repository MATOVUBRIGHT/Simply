import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, GraduationCap, Users, BookOpen, Calendar,
  Receipt, FileText, Award, Clock, User, ChevronRight, X,
  Edit, Save, CheckSquare, Square, Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useCurrency } from '../hooks/useCurrency';
import { useBackOrFallback } from '../utils/navigation';
import { getSubjectDisplayCode } from '../utils/subjects';
import { dataService } from '../lib/database/SupabaseDataService';
import { useToast } from '../contexts/ToastContext';

export default function ClassDetail() {
  const { id: classId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goBack = useBackOrFallback('/classes');
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { formatMoney } = useCurrency();
  const { addToast } = useToast();

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
  const { data: settingsData } = useTableData(sid, 'settings');

  const cls = useMemo(() => (classesData as any[]).find(c => c.id === classId), [classesData, classId]);

  const students = useMemo(
    () => (studentsData as any[]).filter(s => s.classId === classId && s.status !== 'completed'),
    [studentsData, classId]
  );

  const subjects = useMemo(
    () => (subjectsData as any[]).filter(s => s.classId === classId),
    [subjectsData, classId]
  );
  const optionalSubjectsKey = `classOptionalSubjectIds:${classId}`;
  const classOptionalSubjectIds = useMemo(() => {
    const raw = (settingsData as any[]).find((setting: any) => setting.key === optionalSubjectsKey)?.value;
    const parsed = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? (() => {
            try {
              const json = JSON.parse(raw);
              return Array.isArray(json) ? json : raw.split(',').map(part => part.trim());
            } catch {
              return raw.split(',').map(part => part.trim());
            }
          })()
        : [];
    return new Set(parsed.map(String).filter(Boolean));
  }, [settingsData, optionalSubjectsKey]);
  const coreSubjects = useMemo(() => subjects.filter((subject: any) => !classOptionalSubjectIds.has(String(subject.id))), [subjects, classOptionalSubjectIds]);
  const optionalSubjects = useMemo(() => subjects.filter((subject: any) => classOptionalSubjectIds.has(String(subject.id))), [subjects, classOptionalSubjectIds]);

  // Teachers assigned directly to this class or through subjects
  const teachers = useMemo(() => {
    const teacherIds = new Set(subjects.map((s: any) => s.teacherId).filter(Boolean));
    // Also include staff whose subjects list contains any subject in this class
    const bySubject = (staffData as any[]).filter(st =>
      (st.subjects || []).some((sn: string) => subjects.find((s: any) => s.name === sn))
    );
    const byId = (staffData as any[]).filter(st => teacherIds.has(st.id));
    const byClass = (staffData as any[]).filter(st => Array.isArray(st.assignedClassIds) && st.assignedClassIds.includes(classId));
    const merged = new Map<string, any>();
    [...byId, ...bySubject, ...byClass].forEach(t => merged.set(t.id, t));
    return Array.from(merged.values());
  }, [staffData, subjects, classId]);

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
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [showOptionalModal, setShowOptionalModal] = useState(false);
  const [optionalDraft, setOptionalDraft] = useState<Set<string>>(new Set());
  const [savingOptionals, setSavingOptionals] = useState(false);

  function openOptionalModal() {
    setOptionalDraft(new Set(Array.from(classOptionalSubjectIds)));
    setShowOptionalModal(true);
  }

  function toggleOptionalDraft(subjectId: string) {
    setOptionalDraft(prev => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  }

  async function saveClassOptionals() {
    if (!sid || !classId || savingOptionals) return;
    setSavingOptionals(true);
    try {
      const validIds = new Set(subjects.map((subject: any) => String(subject.id)));
      const optionalIds = Array.from(optionalDraft).filter(subjectId => validIds.has(subjectId));
      await dataService.saveSettings(sid, { [optionalSubjectsKey]: optionalIds });
      setShowOptionalModal(false);
      addToast('Class optional subjects updated', 'success');
    } catch {
      addToast('Failed to save optional subjects', 'error');
    } finally {
      setSavingOptionals(false);
    }
  }

  const selectedStudentResults = useMemo(() => {
    if (!selectedStudent) return [];
    return (examResultsData as any[])
      .filter(result => result.studentId === selectedStudent.id && (!result.classId || result.classId === classId))
      .map(result => ({
        ...result,
        examName: (examsData as any[]).find(exam => exam.id === result.examId)?.name || result.examName || 'Exam',
        subjectName: result.subjectName || subjects.find((subject: any) => subject.id === result.subjectId)?.name || 'Subject',
      }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [selectedStudent, examResultsData, examsData, subjects, classId]);

  if (!cls) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <GraduationCap size={48} className="text-slate-300" />
        <p className="text-slate-500 font-medium">Class not found</p>
        <button onClick={goBack} className="btn btn-secondary">Back to Classes</button>
      </div>
    );
  }

  const enrolled = students.length;
  const pct = cls.capacity > 0 ? Math.round((enrolled / cls.capacity) * 100) : 0;
  const overCapacity = cls.capacity > 0 && enrolled > cls.capacity;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
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
          { label: 'Subjects', value: subjects.length, sub: `${optionalSubjects.length} optional`, icon: <BookOpen size={20} />, color: 'bg-emerald-500' },
          { label: 'Attendance', value: `${attendanceSummary.rate}%`, sub: `${attendanceSummary.present}/${attendanceSummary.total} present`, icon: <Calendar size={20} />, color: 'bg-amber-500' },
        ].map(stat => (
          <section key={stat.label} className="card overflow-hidden">
            <div className="card-body">
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
          </section>
        ))}
      </div>

      {/* Enrollment bar */}
      <section className="card overflow-hidden">
        <div className="card-body">
          <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enrollment</span>
          <span className="text-sm text-slate-500">{enrolled}/{cls.capacity} ({pct}%)</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${overCapacity ? 'bg-amber-500' : pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        {overCapacity && (
          <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-300">
            This class is over capacity. Increase capacity or ignore; all enrolled students are still counted.
          </p>
        )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Students */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between gap-3">
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
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStudent(s)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{index + 1}</span>
                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{s.firstName?.[0]}{s.lastName?.[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{s.firstName} {s.lastName}</p>
                  <p className="text-xs text-slate-400 truncate">{s.admissionNo || s.studentId}</p>
                </div>
                <span className={`badge text-[10px] ${s.gender === 'female' ? 'badge-violet' : 'badge-info'}`}>{s.gender}</span>
              </button>
            ))}
            {students.length > 20 && (
              <div className="px-5 py-2 text-xs text-slate-400 text-center">+{students.length - 20} more</div>
            )}
          </div>
        </section>

        {/* Subjects */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-emerald-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Subjects ({subjects.length})</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={openOptionalModal} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/20">
                <Edit size={12} /> Assign OPs
              </button>
              <Link to="/subjects" className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
                Manage <ChevronRight size={12} />
              </Link>
            </div>
          </div>
          {subjects.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 text-xs dark:border-slate-700">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200">Core: {coreSubjects.length}</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Optional: {optionalSubjects.length}</span>
            </div>
          )}
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
                {classOptionalSubjectIds.has(String(s.id)) && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">OP</span>}
                <span className="font-mono text-xs text-slate-400">{getSubjectDisplayCode(s)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Teachers */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between gap-3">
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
        </section>

        {/* Finance summary */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between gap-3">
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
        </section>

        {/* Exams */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between gap-3">
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
        </section>

        {/* Timetable */}
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-indigo-500" />
              <h2 className="font-bold text-slate-800 dark:text-white">Timetable ({classTimetable.length} periods)</h2>
            </div>
            <Link to={`/classes/timetable?classId=${classId}`} className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
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
                      let sub = (subjectsData as any[]).find(s => s.id === t.subjectId);
                      const teacher = (staffData as any[]).find(s => s.id === t.teacherId);
                      const exam = (examsData as any[]).find(e => e.id === t.examId);
                      const title = t.entryType === 'free' ? 'Free Time' : t.customName || exam?.name || sub?.name || 'Event';
                      const kind = t.entryType === 'free' ? 'Free' : t.entryType === 'exam' || t.examId ? 'Exam' : t.entryType === 'event' || t.customName ? 'Event' : 'Class';
                      if (!sub) sub = { name: title };
                      return (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs">
                          <span className="text-slate-400 w-20 shrink-0">{t.startTime}–{t.endTime}</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200 flex-1 truncate">{sub?.name || '—'}</span>
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-600 dark:text-slate-300">{kind}</span>
                          {t.room && <span className="text-slate-400 truncate">Room {t.room}</span>}
                          {teacher && <span className="text-slate-400 truncate">{teacher.firstName} {teacher.lastName}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Report cards quick link */}
      <section className="card overflow-hidden">
        <div className="card-body flex items-center justify-between gap-4">
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
      </section>

      {showOptionalModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onClick={() => !savingOptionals && setShowOptionalModal(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Assign Optional Subjects</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{cls.name} · choose subjects students may select as OPs</p>
              </div>
              <button type="button" onClick={() => !savingOptionals && setShowOptionalModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-4">
              {subjects.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">Add subjects to this class first, then mark the optional ones here.</p>
              ) : (
                <div className="grid gap-2">
                  {subjects.map((subject: any) => {
                    const selected = optionalDraft.has(String(subject.id));
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => toggleOptionalDraft(String(subject.id))}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                          selected
                            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                        }`}
                      >
                        {selected ? <CheckSquare size={18} className="text-emerald-600" /> : <Square size={18} className="text-slate-400" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{subject.name}</p>
                          <p className="font-mono text-xs text-slate-400">{getSubjectDisplayCode(subject)}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                          {selected ? 'OP' : 'Core'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">{optionalDraft.size} optional selected</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOptionalDraft(new Set())} disabled={savingOptionals || optionalDraft.size === 0} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  Clear
                </button>
                <button type="button" onClick={saveClassOptionals} disabled={savingOptionals || subjects.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {savingOptionals ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedStudent && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-backdrop-in"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedStudent(null);
          }}
        >
          <div className="w-full max-w-[min(92vw,36rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-modal-in">
            <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
                  <Award size={21} />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold leading-tight text-white">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                  <p className="mt-0.5 text-xs font-medium text-white/75">{selectedStudent.admissionNo || selectedStudent.studentId || 'No ID'} · {cls.name} grades</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="rounded-lg p-1.5 text-white transition-colors hover:bg-white/20"
                aria-label="Close student grades"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
              {selectedStudentResults.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
                  <Award size={28} className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">No grades recorded for this student yet.</p>
                </div>
              ) : (
                <div className="table-container min-h-0">
                  <table>
                    <thead>
                      <tr>
                        <th>Exam</th>
                        <th>Subject</th>
                        <th className="text-right">Score</th>
                        <th>Grade</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStudentResults.map((result: any) => (
                        <tr key={result.id}>
                          <td className="font-semibold">{result.examName}</td>
                          <td>{result.subjectName}</td>
                          <td className="text-right tabular-nums">{Number(result.score || 0)} / {Number(result.maxScore || result.max_score || 100)}</td>
                          <td><span className="badge badge-info">{result.grade || '-'}</span></td>
                          <td className="max-w-40 truncate" title={result.remarks || ''}>{result.remarks || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
              <button type="button" onClick={() => navigate(`/students/${selectedStudent.id}`)} className="btn btn-secondary">
                Open Profile
              </button>
              <button type="button" onClick={() => setSelectedStudent(null)} className="btn btn-primary">
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
