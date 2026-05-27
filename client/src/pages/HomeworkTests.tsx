import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, BookOpenCheck, CalendarClock, CheckCircle2, ClipboardList, Edit2, FileText, Mail, Plus, Search, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTableData } from '../lib/store';
import { dataService } from '../lib/database/SupabaseDataService';
import { sortClassesBySectionThenLevel } from '../utils/classroom';
import { matchesTextSearch } from '../utils/searchMatch';
import { getSubjectDisplayCode } from '../utils/subjects';
import { shouldSaveOnEnter } from '../utils/keyboard';
import { useConfirm } from '../components/ConfirmModal';

type CardFilter = 'all' | 'homework' | 'tests' | 'completed' | 'results';

type WorkItem = {
  id: string;
  kind: 'homework' | 'test';
  title: string;
  description: string;
  classId: string;
  subjectId: string;
  date: string;
  dueDate: string;
  status: 'issued' | 'completed' | 'results';
  resultCount: number;
  studentCount: number;
};

const cardConfig: Array<{ id: CardFilter; label: string; icon: any; iconClass: string }> = [
  { id: 'homework', label: 'Issued Assignments', icon: BookOpenCheck, iconClass: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { id: 'tests', label: 'Issued Tests', icon: ClipboardList, iconClass: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, iconClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { id: 'results', label: 'Results', icon: Award, iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
];

function toDateTime(value: unknown) {
  const time = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isPast(value: unknown) {
  const time = toDateTime(value);
  if (!time) return false;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return time <= end.getTime();
}

export default function HomeworkTests() {
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const sid = schoolId || user?.id || '';
  const { data: homeworkData, refresh: refreshHomework } = useTableData(sid, 'homework');
  const { data: classesData } = useTableData(sid, 'classes');
  const { data: subjectsData } = useTableData(sid, 'subjects');
  const { data: examsData } = useTableData(sid, 'exams');
  const { data: examResultsData } = useTableData(sid, 'examResults');
  const { data: studentsData } = useTableData(sid, 'students');

  const [activeCard, setActiveCard] = useState<CardFilter>('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [search, setSearch] = useState('');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingHomeworkId, setEditingHomeworkId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    classId: '',
    subjectId: '',
    dueDate: new Date().toISOString().slice(0, 10),
  });

  const classes = useMemo(() => sortClassesBySectionThenLevel(classesData as any[]), [classesData]);
  const subjects = subjectsData as any[];
  const students = studentsData as any[];
  const examResults = examResultsData as any[];

  const className = (classId?: string) => classes.find((cls: any) => cls.id === classId)?.name || 'All Classes';
  const subjectName = (subjectId?: string) => {
    const subject = subjects.find((item: any) => item.id === subjectId);
    if (!subject) return 'General';
    const code = getSubjectDisplayCode(subject);
    return [subject.name, code].filter(Boolean).join(' ');
  };

  const subjectOptions = useMemo(() => {
    const filtered = filterClass === 'all'
      ? subjects
      : subjects.filter((subject: any) => !subject.classId || subject.classId === filterClass);
    return filtered.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [subjects, filterClass]);

  const items = useMemo<WorkItem[]>(() => {
    const homeworkItems = (homeworkData as any[]).map(item => {
      const classStudents = students.filter((student: any) => !item.classId || student.classId === item.classId);
      return {
        id: item.id,
        kind: 'homework' as const,
        title: item.title || 'Assignment',
        description: item.description || '',
        classId: item.classId || '',
        subjectId: item.subjectId || '',
        date: item.createdAt || item.updatedAt || item.dueDate || '',
        dueDate: item.dueDate || '',
        status: isPast(item.dueDate) ? 'completed' as const : 'issued' as const,
        resultCount: 0,
        studentCount: classStudents.length,
      };
    });

    const testItems = (examsData as any[]).map(exam => {
      const results = examResults.filter((result: any) => result.examId === exam.id);
      const subjectIds = Array.from(new Set(results.map((result: any) => result.subjectId).filter(Boolean)));
      const subjectId = subjectIds.length === 1 ? String(subjectIds[0]) : '';
      const classStudents = students.filter((student: any) => !exam.classId || student.classId === exam.classId);
      return {
        id: exam.id,
        kind: 'test' as const,
        title: exam.name || exam.examType || 'Test',
        description: `Term ${exam.term || '-'} ${exam.year || ''}`.trim(),
        classId: exam.classId || '',
        subjectId,
        date: exam.startDate || exam.createdAt || '',
        dueDate: exam.endDate || exam.startDate || '',
        status: results.length > 0 ? 'results' as const : isPast(exam.endDate || exam.startDate) ? 'completed' as const : 'issued' as const,
        resultCount: results.length,
        studentCount: classStudents.length,
      };
    });

    return [...homeworkItems, ...testItems].sort((a, b) => toDateTime(b.date || b.dueDate) - toDateTime(a.date || a.dueDate));
  }, [homeworkData, examsData, examResults, students]);

  const counts = useMemo(() => ({
    homework: items.filter(item => item.kind === 'homework').length,
    tests: items.filter(item => item.kind === 'test').length,
    completed: items.filter(item => item.status === 'completed' || item.status === 'results').length,
    results: items.filter(item => item.status === 'results').length,
  }), [items]);

  const filteredItems = useMemo(() => items.filter(item => {
    if (activeCard === 'homework' && item.kind !== 'homework') return false;
    if (activeCard === 'tests' && item.kind !== 'test') return false;
    if (activeCard === 'completed' && item.status !== 'completed' && item.status !== 'results') return false;
    if (activeCard === 'results' && item.status !== 'results') return false;
    if (filterClass !== 'all' && item.classId !== filterClass) return false;
    if (filterSubject !== 'all' && item.subjectId !== filterSubject) return false;
    if (search && !matchesTextSearch([item.title, item.description, className(item.classId), subjectName(item.subjectId)], search)) return false;
    return true;
  }), [items, activeCard, filterClass, filterSubject, search, classes, subjects]);

  async function saveHomework() {
    if (!sid || saving) return;
    if (!draft.title.trim() || !draft.classId || !draft.subjectId) {
      addToast('Add title, class, and subject', 'warning');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        classId: draft.classId,
        subjectId: draft.subjectId,
        dueDate: draft.dueDate,
        updatedAt: now,
      };
      if (editingHomeworkId) {
        await dataService.update(sid, 'homework', editingHomeworkId, payload as any);
      } else {
        await dataService.create(sid, 'homework', {
          id: uuidv4(),
          ...payload,
          createdAt: now,
        } as any);
      }
      setShowIssueModal(false);
      setEditingHomeworkId(null);
      setDraft({ title: '', description: '', classId: '', subjectId: '', dueDate: new Date().toISOString().slice(0, 10) });
      refreshHomework();
      addToast(editingHomeworkId ? 'Assignment updated' : 'Assignment issued', 'success');
    } catch {
      addToast('Failed to issue assignment', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openNewHomework() {
    setEditingHomeworkId(null);
    setDraft({ title: '', description: '', classId: '', subjectId: '', dueDate: new Date().toISOString().slice(0, 10) });
    setShowIssueModal(true);
  }

  function openEditHomework(item: WorkItem) {
    setEditingHomeworkId(item.id);
    setDraft({
      title: item.title,
      description: item.description,
      classId: item.classId,
      subjectId: item.subjectId,
      dueDate: item.dueDate || new Date().toISOString().slice(0, 10),
    });
    setShowIssueModal(true);
  }

  async function deleteHomework(item: WorkItem) {
    if (!sid || item.kind !== 'homework') return;
    const ok = await confirm({
      title: 'Delete Assignment?',
      description: `Delete "${item.title}" from assignment records?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dataService.delete(sid, 'homework', item.id);
      refreshHomework();
      addToast('Assignment deleted', 'success');
    } catch {
      addToast('Failed to delete assignment', 'error');
    }
  }

  function sendToEmailAll(item: WorkItem) {
    const classStudents = students.filter((student: any) => !item.classId || student.classId === item.classId);
    const emails = Array.from(new Set(classStudents.flatMap((student: any) => [
      student.guardianEmail,
      student.email,
      student.studentEmail,
    ]).filter(Boolean)));
    if (emails.length === 0) {
      addToast('No student or parent emails found for this class', 'warning');
      return;
    }
    const subject = encodeURIComponent(`${item.kind === 'test' ? 'Test' : 'Assignment'}: ${item.title}`);
    const body = encodeURIComponent(`${item.title}\n\n${item.description || ''}\n\n${item.dueDate ? `Due: ${item.dueDate}` : ''}`);
    window.open(`mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${subject}&body=${body}`, '_blank');
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Assignments & Tests</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track issued assignments, tests, completed work, and recorded results.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 overflow-visible sm:w-auto sm:justify-end">
          <button onClick={() => navigate('/grades')} className="btn btn-secondary">
            <Award size={18} /> Exams
          </button>
          <button onClick={openNewHomework} className="btn btn-primary shadow-lg shadow-primary-500/25">
            <Plus size={18} /> Issue Assignment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cardConfig.map(card => {
          const Icon = card.icon;
          const isActive = activeCard === card.id;
          return (
            <button
              key={card.id}
              onClick={() => setActiveCard(isActive ? 'all' : card.id)}
              className={`card text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${isActive ? 'ring-2 ring-primary-400' : ''}`}
            >
              <div className="card-body flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.iconClass}`}>
                  <Icon size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{card.label}</p>
                  <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{counts[card.id as keyof typeof counts]}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="card overflow-hidden">
        <div className="card-body grid grid-cols-1 gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(120px,150px)_minmax(135px,170px)_minmax(88px,auto)]">
          <div className="input-icon-wrapper">
            <Search size={16} className="input-icon" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="form-input form-input-with-icon" placeholder="Search assignments or tests..." />
          </div>
          <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setFilterSubject('all'); }} className="form-input form-select truncate px-3 pr-7">
            <option value="all">All Classes</option>
            {classes.map((cls: any) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
          </select>
          <select value={filterSubject} onChange={e => setFilterSubject(e.target.value)} className="form-input form-select truncate px-3 pr-7">
            <option value="all">All Subjects</option>
            {subjectOptions.map((subject: any) => <option key={subject.id} value={subject.id}>{subjectName(subject.id)}</option>)}
          </select>
          <button onClick={() => { setActiveCard('all'); setFilterClass('all'); setFilterSubject('all'); setSearch(''); }} className="btn btn-secondary">
            Clear
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="card-header flex items-center justify-between gap-3">
          <h2 className="font-bold text-slate-800 dark:text-white">Records</h2>
          <span className="badge badge-info">{filteredItems.length} shown</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center">
              <FileText size={42} className="mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-500">No assignments or tests match the filters.</p>
            </div>
          ) : filteredItems.map(item => (
            <div
              key={`${item.kind}-${item.id}`}
              onClick={() => item.kind === 'test' ? navigate(`/exam-marks`) : setActiveCard('homework')}
              className="grid w-full cursor-pointer grid-cols-1 gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 md:grid-cols-[minmax(0,1fr)_minmax(110px,140px)_minmax(120px,150px)_minmax(105px,125px)_minmax(116px,auto)]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${item.kind === 'test' ? 'badge-info' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>
                    {item.kind === 'test' ? 'Test' : 'Assignment'}
                  </span>
                  <span className={`badge ${item.status === 'results' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : item.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                    {item.status === 'results' ? 'Results Entered' : item.status === 'completed' ? 'Completed' : 'Issued'}
                  </span>
                </div>
                <p className="mt-2 truncate font-bold text-slate-900 dark:text-white">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{item.description || 'No description added.'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Class</p>
                <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{className(item.classId)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Subject</p>
                <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{subjectName(item.subjectId)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">{item.kind === 'test' ? 'Results' : 'Due'}</p>
                <p className="mt-1 flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                  <CalendarClock size={14} />
                  {item.kind === 'test' ? `${item.resultCount}/${Math.max(item.studentCount, item.resultCount)}` : item.dueDate || '-'}
                </p>
              </div>
              <div className="flex items-center gap-1 md:justify-end" onClick={event => event.stopPropagation()}>
                <button type="button" onClick={() => sendToEmailAll(item)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20" title="Email all students and parents">
                  <Mail size={16} />
                </button>
                {item.kind === 'homework' && (
                  <>
                    <button type="button" onClick={() => openEditHomework(item)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white" title="Edit assignment">
                      <Edit2 size={16} />
                    </button>
                    <button type="button" onClick={() => void deleteHomework(item)} className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete assignment">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {showIssueModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-x-hidden bg-black/50 p-4 backdrop-blur-sm" onClick={() => { setShowIssueModal(false); setEditingHomeworkId(null); }}>
          <div
            className="modal-card w-full max-w-2xl"
            onClick={event => event.stopPropagation()}
            onKeyDown={event => {
              if (!shouldSaveOnEnter(event)) return;
              event.preventDefault();
              void saveHomework();
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div>
                <h2 className="font-bold text-white">{editingHomeworkId ? 'Edit Assignment' : 'Issue Assignment'}</h2>
                <p className="text-xs text-white/75">{editingHomeworkId ? 'Update assignment details.' : 'Create an assignment for a class and subject.'}</p>
              </div>
              <button onClick={() => { setShowIssueModal(false); setEditingHomeworkId(null); }} className="rounded-lg p-1.5 transition-colors hover:bg-white/20">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="form-label">Title</label>
                <input value={draft.title} onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))} className="form-input" placeholder="e.g., Algebra exercise" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="form-label">Class</label>
                  <select value={draft.classId} onChange={e => setDraft(prev => ({ ...prev, classId: e.target.value, subjectId: '' }))} className="form-input form-select">
                    <option value="">Select class</option>
                    {classes.map((cls: any) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Subject</label>
                  <select value={draft.subjectId} onChange={e => setDraft(prev => ({ ...prev, subjectId: e.target.value }))} className="form-input form-select">
                    <option value="">Select subject</option>
                    {subjects
                      .filter((subject: any) => !draft.classId || !subject.classId || subject.classId === draft.classId)
                      .map((subject: any) => <option key={subject.id} value={subject.id}>{subjectName(subject.id)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Due Date</label>
                  <input type="date" value={draft.dueDate} onChange={e => setDraft(prev => ({ ...prev, dueDate: e.target.value }))} className="form-input" />
                </div>
              </div>
              <div>
                <label className="form-label">Details</label>
                <textarea value={draft.description} onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))} className="form-input min-h-[110px]" placeholder="Instructions, pages, questions, or submission notes..." />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button onClick={() => { setShowIssueModal(false); setEditingHomeworkId(null); }} className="btn btn-secondary">Cancel</button>
                <button onClick={saveHomework} disabled={saving} className="btn btn-primary disabled:opacity-70">
                  {saving ? 'Saving...' : editingHomeworkId ? 'Save Changes' : 'Issue Assignment'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
