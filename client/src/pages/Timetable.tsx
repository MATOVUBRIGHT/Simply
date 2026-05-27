import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CalendarDays, Clock, Maximize2, Minimize2, Printer, Save, School, Table2, X } from 'lucide-react';
import type { Class, Exam, Staff, Subject, TimetableEntry } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { generateUUID } from '../utils/uuid';
import { sortClassesBySectionThenLevel } from '../utils/classroom';
import { getSubjectDisplayCode } from '../utils/subjects';
import { openPrintPreview } from '../utils/printPreview';

type DraftCell = {
  id?: string;
  classId: string;
  dayOfWeek: number;
  period: number;
  startTime: string;
  endTime: string;
  entryType: 'class' | 'exam' | 'event' | 'free';
  subjectId: string;
  examId: string;
  customName: string;
  room: string;
  teacherId: string;
};

type Slot = { startTime: string; endTime: string };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_SLOTS: Slot[] = [
  { startTime: '08:00', endTime: '09:00' },
  { startTime: '09:00', endTime: '10:00' },
  { startTime: '10:00', endTime: '11:00' },
  { startTime: '11:30', endTime: '12:30' },
  { startTime: '12:30', endTime: '13:30' },
  { startTime: '14:00', endTime: '15:00' },
  { startTime: '15:00', endTime: '16:00' },
];

const HIGHLIGHT_STYLES = [
  'bg-rose-600 border-rose-500',
  'bg-sky-600 border-sky-500',
  'bg-violet-500 border-violet-400',
  'bg-amber-500 border-amber-400',
  'bg-emerald-600 border-emerald-500',
  'bg-fuchsia-700 border-fuchsia-600',
  'bg-cyan-600 border-cyan-500',
  'bg-indigo-600 border-indigo-500',
];

function minutes(time: string) {
  const [hours, mins] = String(time || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(mins) ? mins : 0);
}

function overlaps(a: Pick<DraftCell, 'startTime' | 'endTime'>, b: Pick<DraftCell, 'startTime' | 'endTime'>) {
  return minutes(a.startTime) < minutes(b.endTime) && minutes(a.endTime) > minutes(b.startTime);
}

function slotKey(slot: Slot) {
  return `${slot.startTime}-${slot.endTime}`;
}

function cellKey(day: number, slot: Slot) {
  return `${day}-${slotKey(slot)}`;
}

function normalizeTeacherRole(role?: string) {
  return String(role || '').toLowerCase();
}

function hashText(value: string) {
  return Array.from(value || 'period').reduce((total, char) => total + char.charCodeAt(0), 0);
}

export default function Timetable() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { addToast } = useToast();
  const [params, setParams] = useSearchParams();
  const { data: classesData } = useTableData(sid, 'classes');
  const { data: subjectsData } = useTableData(sid, 'subjects');
  const { data: staffData } = useTableData(sid, 'staff');
  const { data: examsData } = useTableData(sid, 'exams');
  const { data: timetableData } = useTableData(sid, 'timetable');
  const classes = useMemo(() => sortClassesBySectionThenLevel(classesData as Class[]), [classesData]);
  const subjects = subjectsData as Subject[];
  const exams = examsData as Exam[];
  const teachers = useMemo(() =>
    (staffData as Staff[]).filter(staff => normalizeTeacherRole(staff.role).includes('teacher')),
    [staffData]
  );
  const timetable = timetableData as TimetableEntry[];
  const initialClassId = params.get('classId') || classes[0]?.id || '';
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const [mode, setMode] = useState<'class' | 'overall'>(params.get('view') === 'overall' ? 'overall' : 'class');
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [newSlot, setNewSlot] = useState<Slot>({ startTime: '16:00', endTime: '17:00' });
  const [draft, setDraft] = useState<Record<string, DraftCell>>({});
  const [saving, setSaving] = useState(false);
  const [fullScreenEdit, setFullScreenEdit] = useState(false);

  const classMap = useMemo(() => new Map(classes.map(item => [item.id, item])), [classes]);
  const subjectMap = useMemo(() => new Map(subjects.map(item => [item.id, item])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map(item => [item.id, item])), [teachers]);
  const examMap = useMemo(() => new Map(exams.map(item => [item.id, item])), [exams]);

  useEffect(() => {
    if (!selectedClassId && classes[0]?.id) setSelectedClassId(classes[0].id);
  }, [classes, selectedClassId]);

  useEffect(() => {
    const classId = params.get('classId');
    if (classId && classId !== selectedClassId) setSelectedClassId(classId);
    setMode(params.get('view') === 'overall' ? 'overall' : 'class');
  }, [params]);

  const allSlots = useMemo(() => {
    const map = new Map<string, Slot>();
    [...DEFAULT_SLOTS, ...slots].forEach(slot => map.set(slotKey(slot), slot));
    timetable.forEach(entry => {
      if (entry.startTime && entry.endTime) map.set(slotKey(entry), { startTime: entry.startTime, endTime: entry.endTime });
    });
    return Array.from(map.values()).sort((a, b) => minutes(a.startTime) - minutes(b.startTime) || minutes(a.endTime) - minutes(b.endTime));
  }, [slots, timetable]);

  const classSubjects = useMemo(() =>
    subjects
      .filter(subject => subject.classId === selectedClassId)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })),
    [subjects, selectedClassId]
  );

  const classExams = useMemo(() =>
    exams
      .filter(exam => !exam.classId || exam.classId === selectedClassId)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })),
    [exams, selectedClassId]
  );

  const classEntries = useMemo(() =>
    timetable
      .filter(entry => entry.classId === selectedClassId)
      .sort((a, b) => Number(a.dayOfWeek) - Number(b.dayOfWeek) || minutes(a.startTime) - minutes(b.startTime)),
    [timetable, selectedClassId]
  );

  useEffect(() => {
    const next: Record<string, DraftCell> = {};
    classEntries.forEach((entry, index) => {
      const dayOfWeek = Number(entry.dayOfWeek || 1);
      const period = Number(entry.period || index + 1);
      next[cellKey(dayOfWeek, entry)] = {
        id: entry.id,
        classId: entry.classId,
        dayOfWeek,
        period,
        startTime: entry.startTime,
        endTime: entry.endTime,
        entryType: (entry.entryType as DraftCell['entryType']) || (entry.examId ? 'exam' : entry.customName ? 'event' : 'class'),
        subjectId: entry.subjectId || '',
        examId: entry.examId || '',
        customName: entry.customName || '',
        room: entry.room || '',
        teacherId: String((entry as any).teacherId || ''),
      };
    });
    setDraft(next);
  }, [classEntries]);

  const filledDraftCells = useMemo(() =>
    Object.values(draft).filter(cell => cell.entryType === 'free' || cell.subjectId || cell.teacherId || cell.examId || cell.customName.trim() || cell.room.trim()),
    [draft]
  );

  const allVisibleEntries = useMemo(() => {
    const selectedIds = new Set(filledDraftCells.map(cell => cell.id).filter(Boolean));
    const savedOutsideDraft = timetable.filter(entry => entry.classId !== selectedClassId || !selectedIds.has(entry.id));
    return [
      ...savedOutsideDraft.map((entry, index) => ({
        id: entry.id,
        classId: entry.classId,
        dayOfWeek: Number(entry.dayOfWeek || 1),
        period: Number(entry.period || index + 1),
        startTime: entry.startTime,
        endTime: entry.endTime,
        entryType: (entry.entryType as DraftCell['entryType']) || (entry.examId ? 'exam' : entry.customName ? 'event' : 'class'),
        subjectId: entry.subjectId,
        examId: entry.examId || '',
        customName: entry.customName || '',
        room: entry.room || '',
        teacherId: String((entry as any).teacherId || ''),
      })),
      ...filledDraftCells,
    ];
  }, [filledDraftCells, selectedClassId, timetable]);

  const collisions = useMemo(() => {
    const issues: { key: string; title: string; detail: string; entryIds: string[]; classIds: string[] }[] = [];
    const entries = allVisibleEntries.filter(entry => entry.entryType === 'free' || entry.subjectId || entry.examId || entry.customName);
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        if (a.dayOfWeek !== b.dayOfWeek || !overlaps(a, b)) continue;
        if (a.classId === b.classId) {
          issues.push({
            key: `class-${a.classId}-${a.dayOfWeek}-${a.startTime}-${b.startTime}`,
            title: `${classMap.get(a.classId)?.name || 'Class'} has overlapping periods`,
            detail: `${DAYS[a.dayOfWeek - 1]} ${a.startTime}-${a.endTime} overlaps ${b.startTime}-${b.endTime}`,
            entryIds: [a.id || '', b.id || ''].filter(Boolean),
            classIds: [a.classId],
          });
        }
        if (a.teacherId && a.teacherId === b.teacherId && a.classId !== b.classId) {
          const teacher = teacherMap.get(a.teacherId);
          issues.push({
            key: `teacher-${a.teacherId}-${a.dayOfWeek}-${a.startTime}-${b.startTime}`,
            title: `${teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Teacher'} is double-booked`,
            detail: `${DAYS[a.dayOfWeek - 1]} ${a.startTime}-${a.endTime}: ${classMap.get(a.classId)?.name || 'Class'} and ${classMap.get(b.classId)?.name || 'Class'}`,
            entryIds: [a.id || '', b.id || ''].filter(Boolean),
            classIds: [a.classId, b.classId],
          });
        }
      }
    }
    return Array.from(new Map(issues.map(issue => [issue.key, issue])).values());
  }, [allVisibleEntries, classMap, teacherMap]);

  function updateCell(day: number, slot: Slot, updates: Partial<DraftCell>) {
    const key = cellKey(day, slot);
    setDraft(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        classId: selectedClassId,
        dayOfWeek: day,
        period: allSlots.findIndex(item => slotKey(item) === slotKey(slot)) + 1,
        startTime: slot.startTime,
        endTime: slot.endTime,
        entryType: 'class',
        subjectId: '',
        examId: '',
        customName: '',
        room: '',
        teacherId: '',
        ...updates,
      },
    }));
  }

  function clearCell(day: number, slot: Slot) {
    const key = cellKey(day, slot);
    setDraft(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        classId: selectedClassId,
        dayOfWeek: day,
        period: allSlots.findIndex(item => slotKey(item) === slotKey(slot)) + 1,
        startTime: slot.startTime,
        endTime: slot.endTime,
        entryType: prev[key]?.entryType || 'class',
        subjectId: '',
        examId: '',
        customName: '',
        room: '',
        teacherId: '',
      },
    }));
  }

  function addSlot() {
    if (!newSlot.startTime || !newSlot.endTime || minutes(newSlot.endTime) <= minutes(newSlot.startTime)) {
      addToast('Enter a valid start and end time', 'error');
      return;
    }
    setSlots(prev => Array.from(new Map([...prev, newSlot].map(slot => [slotKey(slot), slot])).values()));
    setNewSlot({ startTime: newSlot.endTime, endTime: newSlot.endTime });
  }

  async function saveClassTimetable() {
    if (!sid || !selectedClassId || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const savedByKey = new Map(classEntries.map(entry => [cellKey(Number(entry.dayOfWeek || 1), entry), entry]));
      const draftKeys = new Set(Object.keys(draft));
      const tasks: Promise<any>[] = [];

      for (const [key, entry] of savedByKey.entries()) {
        const current = draft[key];
        if (!current || (current.entryType !== 'free' && !current.subjectId && !current.teacherId && !current.examId && !current.customName.trim() && !current.room.trim())) {
          tasks.push(dataService.delete(sid, 'timetable', entry.id));
        }
      }

      for (const [key, cell] of Object.entries(draft)) {
        if (cell.entryType !== 'free' && !cell.subjectId && !cell.examId && !cell.customName.trim() && !cell.room.trim()) continue;
        const existing = savedByKey.get(key);
        const payload = {
          classId: selectedClassId,
          dayOfWeek: cell.dayOfWeek,
          period: cell.period,
          entryType: cell.entryType,
          subjectId: cell.entryType === 'class' ? cell.subjectId : '',
          examId: cell.entryType === 'exam' ? cell.examId : '',
          customName: cell.customName.trim(),
          room: cell.room.trim(),
          teacherId: cell.teacherId || null,
          startTime: cell.startTime,
          endTime: cell.endTime,
          updatedAt: now,
        } as any;
        if (existing) {
          tasks.push(dataService.update(sid, 'timetable', existing.id, { ...existing, ...payload }));
        } else if (draftKeys.has(key)) {
          tasks.push(dataService.create(sid, 'timetable', { id: generateUUID(), ...payload, createdAt: now }));
        }
      }

      await Promise.all(tasks);
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'timetable' } }));
      addToast('Timetable saved', 'success');
    } catch {
      addToast('Failed to save timetable', 'error');
    } finally {
      setSaving(false);
    }
  }

  function navigateMode(nextMode: 'class' | 'overall') {
    setMode(nextMode);
    setParams(nextMode === 'overall' ? { view: 'overall' } : { classId: selectedClassId });
  }

  function changeClass(classId: string) {
    setSelectedClassId(classId);
    if (mode === 'class') setParams({ classId });
  }

  function getEntryTitle(entry?: Partial<DraftCell>) {
    if (!entry) return '';
    if (entry.customName?.trim()) return entry.customName.trim();
    if (entry.entryType === 'exam') return entry.examId ? examMap.get(entry.examId)?.name || 'Exam' : 'Exam';
    if (entry.entryType === 'event') return 'Event';
    if (entry.entryType === 'free') return 'Free Time';
    if (entry.subjectId) {
      const subject = subjectMap.get(entry.subjectId);
      return subject ? getSubjectDisplayCode(subject) : 'Class period';
    }
    return '';
  }

  function getEntryMeta(entry?: Partial<DraftCell>) {
    if (!entry) return '';
    const parts: string[] = [];
    if (entry.entryType === 'exam' && entry.examId) {
      const exam = examMap.get(entry.examId);
      if (exam) parts.push(`Term ${exam.term} ${exam.year}`);
    } else if (entry.subjectId) {
      const subject = subjectMap.get(entry.subjectId);
      if (subject) parts.push(getSubjectDisplayCode(subject));
    }
    if (entry.teacherId) {
      const teacher = teacherMap.get(entry.teacherId);
      if (teacher) parts.push(`${teacher.firstName} ${teacher.lastName}`);
    }
    if (entry.room?.trim()) parts.push(`Room ${entry.room.trim()}`);
    return parts.join(' - ');
  }

  function getEntryBadge(entry?: Partial<DraftCell>) {
    if (entry?.entryType === 'exam') return 'Exam';
    if (entry?.entryType === 'event') return 'Event';
    if (entry?.entryType === 'free') return 'Free';
    return 'Class';
  }

  function getEntryHighlightClass(entry?: Partial<DraftCell>) {
    if (entry?.entryType === 'free') return 'bg-slate-500 border-slate-400';
    if (entry?.entryType === 'exam') return 'bg-red-600 border-red-500';
    if (entry?.entryType === 'event') return 'bg-violet-500 border-violet-400';
    const seed = entry?.subjectId || entry?.teacherId || entry?.customName || `${entry?.dayOfWeek || 0}-${entry?.period || 0}`;
    return HIGHLIGHT_STYLES[hashText(seed) % HIGHLIGHT_STYLES.length];
  }

  function getTeacherName(entry?: Partial<DraftCell>) {
    if (!entry?.teacherId) return '';
    const teacher = teacherMap.get(entry.teacherId);
    return teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : '';
  }

  function hasEntryDetails(entry?: Partial<DraftCell>) {
    return Boolean(entry && (entry.entryType === 'free' || entry.subjectId || entry.teacherId || entry.examId || entry.customName?.trim() || entry.room?.trim()));
  }

  function renderHighlightCard(entry: Partial<DraftCell>, compact = false) {
    const title = getEntryTitle(entry) || (entry.entryType === 'free' ? 'Free Time' : 'Period');
    const teacherName = getTeacherName(entry);
    const room = entry.room?.trim();
    return (
      <div className={`rounded-md border ${getEntryHighlightClass(entry)} p-2 text-left text-white shadow-sm ${compact ? 'space-y-0.5' : 'space-y-1'}`}>
        <div className="flex items-start justify-between gap-2">
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-bold leading-tight`}>{title}</p>
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full border border-white/80" />
        </div>
        <p className={`${compact ? 'text-[10px]' : 'text-xs'} leading-tight text-white/95`}>{entry.startTime}-{entry.endTime}</p>
        {teacherName && <p className={`${compact ? 'text-[10px]' : 'text-xs'} truncate leading-tight text-white/95`}>Staff: {teacherName}</p>}
        {room && <p className={`${compact ? 'text-[10px]' : 'text-xs'} truncate font-semibold leading-tight text-white`}>{room}</p>}
        {!teacherName && !room && entry.entryType !== 'free' && (
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} font-semibold leading-tight text-white/95`}>{getEntryBadge(entry)}</p>
        )}
      </div>
    );
  }

  function renderPrintGrid(classItem: Class, entries: DraftCell[]) {
    return (
      <section key={classItem.id} className="break-after-page rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
          <div>
            <h2 className="text-lg font-black text-slate-900">{classItem.name}</h2>
            <p className="text-xs text-slate-500">Class timetable</p>
          </div>
        </div>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">Time</th>
              {DAYS.map(day => <th key={day} className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">{day}</th>)}
            </tr>
          </thead>
          <tbody>
            {allSlots.map(slot => (
              <tr key={slotKey(slot)}>
                <td className="border border-slate-300 px-2 py-1 font-mono font-bold">{slot.startTime}-{slot.endTime}</td>
                {DAYS.map((_, dayIndex) => {
                  const entry = entries.find(item => item.dayOfWeek === dayIndex + 1 && item.startTime === slot.startTime && item.endTime === slot.endTime);
                  const title = getEntryTitle(entry);
                  const meta = getEntryMeta(entry);
                  return (
                    <td key={dayIndex} className="border border-slate-300 px-2 py-1 align-top">
                      {title ? (
                        <>
                          <p className="font-bold">{title}</p>
                          {meta && <p className="text-[10px] text-slate-500">{meta}</p>}
                        </>
                      ) : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  const selectedClass = classMap.get(selectedClassId);
  const selectedClassPrintEntries = filledDraftCells.length > 0 || classEntries.length > 0
    ? Object.values(draft).filter(cell => cell.entryType === 'free' || cell.subjectId || cell.examId || cell.customName.trim() || cell.room.trim())
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 print:hidden lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link to="/classes" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
            <ArrowLeft size={16} /> Classes
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Class Timetables</h1>
          <p className="text-sm text-slate-500">Draft, edit, save, review collisions, and print school timetables.</p>
        </div>
        <div className="action-row">
          <button onClick={() => openPrintPreview('Class Timetable', '#print-selected-class')} className="btn btn-secondary">
            <Printer size={16} /> Print Class
          </button>
          <button onClick={() => openPrintPreview('All Class Timetables', '#print-all-classes')} className="btn btn-secondary">
            <Printer size={16} /> Print All
          </button>
          <button onClick={() => openPrintPreview('Overall School Timetable', '#print-overall-school')} className="btn btn-secondary">
            <School size={16} /> Print Overall
          </button>
          <button onClick={saveClassTimetable} disabled={saving || mode !== 'class'} className="btn btn-primary disabled:opacity-60">
            <Save size={16} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="card p-4 print:hidden">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto_minmax(180px,260px)_1fr] lg:items-end">
          <div>
            <label className="form-label">View</label>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
              <button onClick={() => navigateMode('class')} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === 'class' ? 'bg-white text-primary-600 shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}><Table2 size={15} className="mr-1 inline" />Class</button>
              <button onClick={() => navigateMode('overall')} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === 'overall' ? 'bg-white text-primary-600 shadow-sm dark:bg-slate-900' : 'text-slate-500'}`}><School size={15} className="mr-1 inline" />Overall</button>
            </div>
          </div>
          <div>
            <label className="form-label">Class</label>
            <select value={selectedClassId} onChange={event => changeClass(event.target.value)} className="form-input">
              {classes.map(classItem => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label className="form-label">New Slot Start</label>
              <input type="time" value={newSlot.startTime} onChange={event => setNewSlot(prev => ({ ...prev, startTime: event.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">New Slot End</label>
              <input type="time" value={newSlot.endTime} onChange={event => setNewSlot(prev => ({ ...prev, endTime: event.target.value }))} className="form-input" />
            </div>
            <button type="button" onClick={addSlot} className="btn btn-secondary self-end"><Clock size={15} /> Add Slot</button>
          </div>
        </div>
      </div>

      {collisions.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/70 p-4 print:hidden dark:border-amber-800 dark:bg-amber-900/20">
          <div className="mb-3 flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle size={18} />
            <h2 className="font-bold">Collisions Found</h2>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900 dark:bg-amber-800 dark:text-amber-100">{collisions.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {collisions.slice(0, 8).map(issue => (
              <div key={issue.key} className="rounded-lg border border-amber-200 bg-white p-3 text-sm dark:border-amber-800 dark:bg-slate-900">
                <p className="font-bold text-slate-900 dark:text-white">{issue.title}</p>
                <p className="text-xs text-slate-500">{issue.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'class' ? (
        <section className={`${fullScreenEdit ? 'fixed inset-0 z-[9999] flex h-dvh w-screen flex-col rounded-none border-0 bg-white p-0 dark:bg-slate-950' : 'card'} overflow-hidden print:hidden`}>
          <div className={`${fullScreenEdit ? 'shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950' : 'card-header'} flex items-center justify-between gap-3`}>
            <div className="flex min-w-0 items-center gap-2">
              <CalendarDays size={18} className="text-primary-500" />
              <h2 className="truncate font-bold text-slate-900 dark:text-white">{selectedClass?.name || 'Class'} Grid</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="hidden text-xs text-slate-500 sm:block">{classSubjects.length} subject{classSubjects.length === 1 ? '' : 's'} available</p>
              <button
                type="button"
                onClick={() => setFullScreenEdit(prev => !prev)}
                className="btn btn-secondary px-3 py-2 text-xs"
                title={fullScreenEdit ? 'Minimize timetable editor' : 'Open full screen timetable editor'}
              >
                {fullScreenEdit ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {fullScreenEdit ? 'Minimize' : 'Full Screen'}
              </button>
              {fullScreenEdit && (
                <button onClick={saveClassTimetable} disabled={saving} className="btn btn-primary px-3 py-2 text-xs disabled:opacity-60">
                  <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
          </div>
          <div className={`${fullScreenEdit ? 'min-h-0 flex-1 pb-4' : 'max-h-[72vh]'} overflow-auto`}>
            <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80">
                  <th className="sticky left-0 top-0 z-20 w-24 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-black uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800">Time</th>
                  {DAYS.map(day => <th key={day} className="sticky top-0 z-10 w-[132px] border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs font-black uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-800">{day}</th>)}
                </tr>
              </thead>
              <tbody>
                {allSlots.map(slot => (
                  <tr key={slotKey(slot)} className="align-top">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-3 font-mono text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                      {slot.startTime}<br />{slot.endTime}
                    </td>
                    {DAYS.map((_, dayIndex) => {
                      const day = dayIndex + 1;
                      const key = cellKey(day, slot);
                      const cell = draft[key] || { entryType: 'class', subjectId: '', examId: '', customName: '', room: '', teacherId: '' };
                      return (
                        <td key={key} className="border-b border-slate-100 p-1.5 dark:border-slate-800">
                          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                            {hasEntryDetails(cell) && renderHighlightCard({ ...cell, dayOfWeek: day, startTime: slot.startTime, endTime: slot.endTime }, true)}
                            <select
                              value={cell.entryType || 'class'}
                              onChange={event => {
                                const entryType = event.target.value as DraftCell['entryType'];
                                updateCell(day, slot, {
                                  entryType,
                                  subjectId: entryType === 'class' || entryType === 'exam' ? cell.subjectId : '',
                                  examId: entryType === 'exam' ? cell.examId : '',
                                  customName: cell.customName,
                                });
                              }}
                              className="form-input h-8 truncate text-xs"
                            >
                              <option value="class">Class</option>
                              <option value="exam">Exam</option>
                              <option value="event">Custom Event</option>
                              <option value="free">Free Time</option>
                            </select>
                            {((cell.entryType || 'class') === 'class' || cell.entryType === 'exam') && (
                              <select value={cell.subjectId} onChange={event => updateCell(day, slot, { subjectId: event.target.value })} className="form-input h-8 truncate text-xs" title={cell.subjectId ? subjectMap.get(cell.subjectId)?.name : 'Subject'}>
                                <option value="">Subject</option>
                                {classSubjects.map(subject => <option key={subject.id} value={subject.id}>{getSubjectDisplayCode(subject)}</option>)}
                              </select>
                            )}
                            {cell.entryType === 'exam' && (
                              <select value={cell.examId} onChange={event => updateCell(day, slot, { examId: event.target.value })} className="form-input h-8 truncate text-xs">
                                <option value="">Select exam</option>
                                {classExams.map(exam => <option key={exam.id} value={exam.id}>{exam.name} - T{exam.term} {exam.year}</option>)}
                              </select>
                            )}
                            {cell.entryType !== 'free' && (
                              <input
                                value={cell.customName || ''}
                                onChange={event => updateCell(day, slot, { customName: event.target.value })}
                                className="form-input h-8 text-xs"
                                placeholder={cell.entryType === 'exam' ? 'Exam display name' : cell.entryType === 'event' ? 'Event name' : 'Class display name'}
                              />
                            )}
                            <input
                              value={cell.room || ''}
                              onChange={event => updateCell(day, slot, { room: event.target.value })}
                              className="form-input h-8 text-xs"
                              placeholder="Room"
                            />
                            <div className="flex gap-2">
                              <select value={cell.teacherId || ''} onChange={event => updateCell(day, slot, { teacherId: event.target.value })} className="form-input h-8 min-w-0 flex-1 truncate text-xs">
                                <option value="">Teacher</option>
                                {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}
                              </select>
                              {(cell.entryType === 'free' || cell.subjectId || cell.teacherId || cell.examId || cell.customName || cell.room) && (
                                <button type="button" onClick={() => clearCell(day, slot)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" title="Clear period">
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card overflow-hidden print:hidden">
          <div className="card-header flex items-center gap-2">
            <School size={18} className="text-primary-500" />
            <h2 className="font-bold text-slate-900 dark:text-white">Overall School Timetable</h2>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800">
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-black uppercase text-slate-500 dark:border-slate-700">Class</th>
                  {DAYS.map(day => <th key={day} className="border-b border-slate-200 px-3 py-2 text-left font-black uppercase text-slate-500 dark:border-slate-700">{day}</th>)}
                </tr>
              </thead>
              <tbody>
                {classes.map(classItem => (
                  <tr key={classItem.id}>
                    <td className="border-b border-slate-100 px-3 py-3 font-bold text-slate-900 dark:border-slate-800 dark:text-white">{classItem.name}</td>
                    {DAYS.map((_, dayIndex) => {
                      const periods = allVisibleEntries
                        .filter(entry => entry.classId === classItem.id && entry.dayOfWeek === dayIndex + 1)
                        .sort((a, b) => minutes(a.startTime) - minutes(b.startTime));
                      return (
                        <td key={dayIndex} className="min-w-[150px] border-b border-slate-100 px-2 py-2 align-top dark:border-slate-800">
                          <div className="space-y-1.5">
                            {periods.length === 0 ? <span className="text-slate-300">-</span> : periods.map(period => {
                              const meta = getEntryMeta(period);
                              return (
                                <div key={`${period.id || period.classId}-${period.startTime}-${period.subjectId}`} title={meta || undefined}>
                                  {renderHighlightCard(period, true)}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="hidden">
        <div id="print-selected-class" className="print-area">
          {selectedClass && renderPrintGrid(selectedClass, selectedClassPrintEntries)}
        </div>
        <div id="print-all-classes" className="print-area space-y-4">
          {classes.map(classItem => renderPrintGrid(classItem, allVisibleEntries.filter(entry => entry.classId === classItem.id)))}
        </div>
        <div id="print-overall-school" className="print-area space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-black text-slate-900">Overall School Timetable</h2>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">Class</th>
                  {DAYS.map(day => <th key={day} className="border border-slate-300 bg-slate-100 px-2 py-1 text-left">{day}</th>)}
                </tr>
              </thead>
              <tbody>
                {classes.map(classItem => (
                  <tr key={classItem.id}>
                    <td className="border border-slate-300 px-2 py-1 font-bold">{classItem.name}</td>
                    {DAYS.map((_, dayIndex) => (
                      <td key={dayIndex} className="border border-slate-300 px-2 py-1 align-top">
                        {allVisibleEntries
                          .filter(entry => entry.classId === classItem.id && entry.dayOfWeek === dayIndex + 1)
                          .sort((a, b) => minutes(a.startTime) - minutes(b.startTime))
                          .map(entry => {
                            return <p key={`${entry.id}-${entry.startTime}`}><strong>{entry.startTime}</strong> {getEntryTitle(entry) || 'Period'}</p>;
                          })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
