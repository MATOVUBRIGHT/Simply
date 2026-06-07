import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, Copy, GraduationCap, Mail, Search, Send, Square, Users } from 'lucide-react';
import type { Class, Student } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTableData } from '../lib/store';
import { getClassDisplayName } from '../utils/classroom';
import { matchesStudentSearch } from '../utils/studentSearch';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { PortalSelect } from '../components/PortalSelect';
import { ProgressiveListLoader, useProgressiveList } from '../hooks/useProgressiveList';

type EmailMode = 'parents' | 'students' | 'both';
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

const highlightStyles: Record<HighlightColor, string> = {
  yellow: 'bg-amber-50 dark:bg-amber-900/18',
  green: 'bg-emerald-50 dark:bg-emerald-900/18',
  blue: 'bg-sky-50 dark:bg-sky-900/18',
  pink: 'bg-pink-50 dark:bg-pink-900/18',
};
const highlightOptions: Array<{ value: HighlightColor; label: string; dot: string }> = [
  { value: 'yellow', label: 'Yellow', dot: 'bg-amber-400' },
  { value: 'green', label: 'Green', dot: 'bg-emerald-500' },
  { value: 'blue', label: 'Blue', dot: 'bg-sky-500' },
  { value: 'pink', label: 'Pink', dot: 'bg-pink-500' },
];

function getStudentEmail(student: any) {
  return String(student.email || student.studentEmail || '').trim();
}

function getParentEmail(student: any) {
  return String(student.guardianEmail || '').trim();
}

function CellText({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span title={value} className={`block min-w-0 truncate ${className}`}>
      {value || '-'}
    </span>
  );
}

export default function ParentEmails() {
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const sid = schoolId || user?.id || '';
  const { data: studentsData, loading } = useTableData(sid, 'students');
  const { data: classesData } = useTableData(sid, 'classes');
  const students = studentsData as Student[];
  const classes = classesData as Class[];

  const [search, setSearch] = useState('');
  const [filterClassId, setFilterClassId] = useState('all');
  const [emailMode, setEmailMode] = useState<EmailMode>(() => {
    const mode = searchParams.get('mode');
    return mode === 'students' || mode === 'both' ? mode : 'parents';
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow');
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [colorMenuRect, setColorMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [marksReady, setMarksReady] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const listLoading = useMinimumLoading(loading, 2000);
  const markStorageKey = `schofy_parent_email_marks_${sid || 'default'}`;
  const colorButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMarksReady(false);
    try {
      const parsed = JSON.parse(localStorage.getItem(markStorageKey) || 'null');
      setMarkedIds(new Set(Array.isArray(parsed?.ids) ? parsed.ids : []));
      if (parsed?.color && parsed.color in highlightStyles) setHighlightColor(parsed.color);
    } catch {
      setMarkedIds(new Set());
    }
    setMarksReady(true);
  }, [markStorageKey]);

  useEffect(() => {
    if (!marksReady) return;
    localStorage.setItem(markStorageKey, JSON.stringify({ ids: Array.from(markedIds), color: highlightColor }));
  }, [markStorageKey, markedIds, highlightColor, marksReady]);

  function emailsForStudent(student: any, mode = emailMode) {
    const emails: string[] = [];
    if (mode === 'parents' || mode === 'both') {
      const parentEmail = getParentEmail(student);
      if (parentEmail) emails.push(parentEmail);
    }
    if (mode === 'students' || mode === 'both') {
      const studentEmail = getStudentEmail(student);
      if (studentEmail) emails.push(studentEmail);
    }
    return emails;
  }

  const emailRows = useMemo(() => {
    return students
      .filter((student: any) => emailsForStudent(student).length > 0)
      .filter((student: any) => filterClassId === 'all' || student.classId === filterClassId)
      .filter((student: any) => matchesStudentSearch(student, search, [
        student.guardianName,
        student.guardianEmail,
        getStudentEmail(student),
        getClassDisplayName(student.classId, classes),
      ]));
  }, [students, classes, search, filterClassId, emailMode]);

  const selectedRows = emailRows.filter((student: any) => selectedIds.has(student.id));
  const allFilteredSelected = emailRows.length > 0 && emailRows.every((student: any) => selectedIds.has(student.id));
  const selectedEmails = Array.from(new Set(selectedRows.flatMap((student: any) => emailsForStudent(student)).filter(Boolean)));
  const allFilteredEmails = Array.from(new Set(emailRows.flatMap((student: any) => emailsForStudent(student)).filter(Boolean)));
  const emailStats = useMemo(() => ({
    parentEmails: Array.from(new Set(emailRows.map((student: any) => getParentEmail(student)).filter(Boolean))).length,
    studentEmails: Array.from(new Set(emailRows.map((student: any) => getStudentEmail(student)).filter(Boolean))).length,
    selected: selectedRows.length,
    marked: emailRows.filter((student: any) => markedIds.has(student.id)).length,
  }), [emailRows, selectedRows.length, markedIds]);
  const emailProgress = useProgressiveList(emailRows, { initialCount: 80, step: 80, delayMs: 180 });
  const visibleEmailRows = emailProgress.visibleItems;

  function handleSearch(value: string) {
    setSearch(value);
  }

  function updateColorMenuPosition() {
    const rect = colorButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = Math.max(rect.width, 144);
    setColorMenuRect({
      top: rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
      width: menuWidth,
    });
  }

  function toggleColorMenu() {
    if (showColorMenu) {
      setShowColorMenu(false);
      return;
    }
    updateColorMenuPosition();
    setShowColorMenu(true);
  }

  useEffect(() => {
    if (!showColorMenu) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (colorButtonRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-mark-color-menu="true"]')) return;
      setShowColorMenu(false);
    }

    updateColorMenuPosition();
    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('resize', updateColorMenuPosition);
    window.addEventListener('scroll', updateColorMenuPosition, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('resize', updateColorMenuPosition);
      window.removeEventListener('scroll', updateColorMenuPosition, true);
    };
  }, [showColorMenu]);

  function toggleStudent(studentId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        emailRows.forEach((student: any) => next.delete(student.id));
      } else {
        emailRows.forEach((student: any) => next.add(student.id));
      }
      return next;
    });
  }

  function markSelected() {
    if (selectedIds.size === 0) {
      addToast('Select rows to mark first', 'warning');
      return;
    }
    setMarkedIds(prev => new Set([...prev, ...Array.from(selectedIds)]));
    setSelectedIds(new Set());
    addToast('Selected parent rows highlighted', 'success');
  }

  function unmarkSelected() {
    if (selectedIds.size === 0) {
      addToast('Select highlighted rows to clear', 'warning');
      return;
    }
    setMarkedIds(prev => {
      const next = new Set(prev);
      selectedIds.forEach(id => next.delete(id));
      return next;
    });
    setSelectedIds(new Set());
  }

  async function copyEmails(emails: string[], label: string) {
    if (emails.length === 0) {
      addToast(`No ${label} emails to copy`, 'warning');
      return;
    }
    const text = emails.join(', ');
    try {
      await navigator.clipboard.writeText(text);
      addToast(`${emails.length} email${emails.length === 1 ? '' : 's'} copied for Gmail`, 'success');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      addToast(`${emails.length} email${emails.length === 1 ? '' : 's'} copied`, 'success');
    }
  }

  function sendEmails() {
    if (selectedEmails.length === 0) {
      addToast('Select at least one email', 'warning');
      return;
    }
    const params = new URLSearchParams();
    if (subject.trim()) params.set('subject', subject.trim());
    if (message.trim()) params.set('body', message.trim());
    window.open(`mailto:?bcc=${encodeURIComponent(selectedEmails.join(','))}${params.toString() ? `&${params.toString()}` : ''}`, '_blank');
  }

  return (
    <div className="max-w-full space-y-5 overflow-x-hidden animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Parents & Student Emails</h1>
          <p className="mt-1 text-sm text-slate-500">Select by class, copy emails for Gmail, or open an email draft.</p>
        </div>
        <Link to="/parents" className="btn btn-secondary">
          <Users size={18} /> Parents List
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Parent Emails', value: emailStats.parentEmails, icon: Mail, color: 'card-solid-indigo' },
          { label: 'Student Emails', value: emailStats.studentEmails, icon: GraduationCap, color: 'card-solid-cyan' },
          { label: 'Selected Rows', value: emailStats.selected, icon: Check, color: 'card-solid-emerald' },
          { label: 'Marked Rows', value: emailStats.marked, icon: Users, color: 'card-solid-amber' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <section key={card.label} className={`rounded-lg p-4 text-white shadow-lg ${card.color}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/18"><Icon size={20} /></span>
                <div><p className="text-xs font-bold text-white/75">{card.label}</p><p className="text-2xl font-black">{card.value}</p></div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card relative z-10 min-w-0 overflow-visible">
          <div className="card-header relative z-20 space-y-3 bg-slate-100/70 dark:bg-slate-900/40">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(220px,1fr)_145px_230px]">
              <div className="relative">
                <Search size={18} className="search-input-icon" />
                <input
                  value={search}
                  onChange={event => handleSearch(event.target.value)}
                  className="search-input h-11"
                  placeholder="Search by student name, ID, parent, email..."
                />
              </div>
              <PortalSelect
                value={filterClassId}
                onChange={value => { setFilterClassId(value); }}
                className="h-11"
                options={[
                  { value: 'all', label: 'All Classes' },
                  ...classes.map(classItem => ({ value: classItem.id, label: classItem.name })),
                ]}
              />
              <div className="grid h-11 grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white text-xs font-bold shadow-sm dark:border-slate-700 dark:bg-slate-800">
                {[
                  ['parents', 'Parents', Mail],
                  ['students', 'Students', GraduationCap],
                  ['both', 'Both', Users],
                ].map(([mode, label, Icon]: any) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setEmailMode(mode);
                      setSelectedIds(new Set());
                    }}
                    className={`flex min-w-0 items-center justify-center gap-1 px-2 transition-colors ${emailMode === mode ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800/80 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button onClick={toggleAllFiltered} className="btn btn-secondary h-9 px-3 py-1.5 text-sm">
                  {allFilteredSelected ? <Check size={16} /> : <Square size={16} />}
                  {allFilteredSelected ? 'Deselect All' : 'Select All'}
                </button>
                <button onClick={() => copyEmails(selectedEmails, 'selected')} className="btn btn-secondary h-9 px-3 py-1.5 text-sm" disabled={selectedEmails.length === 0}>
                  <Copy size={16} /> Copy Selected
                </button>
                <button onClick={() => copyEmails(allFilteredEmails, 'filtered')} className="btn btn-secondary h-9 px-3 py-1.5 text-sm" disabled={allFilteredEmails.length === 0}>
                  <Copy size={16} /> Copy All
                </button>
                <div className="relative">
                  <button
                    ref={colorButtonRef}
                    type="button"
                    onClick={toggleColorMenu}
                    className="flex h-9 min-w-[128px] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${highlightOptions.find(option => option.value === highlightColor)?.dot}`} />
                      <span className="truncate">{highlightOptions.find(option => option.value === highlightColor)?.label}</span>
                    </span>
                    <ChevronDown size={14} className={`shrink-0 transition-transform ${showColorMenu ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                <button onClick={markSelected} className="btn btn-secondary h-9 px-3 py-1.5 text-sm" disabled={selectedIds.size === 0}>
                  Mark
                </button>
                <button onClick={unmarkSelected} className="btn btn-secondary h-9 px-3 py-1.5 text-sm" disabled={selectedIds.size === 0}>
                  Unmark
                </button>
              </div>
              <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                {selectedRows.length} student{selectedRows.length === 1 ? '' : 's'} selected - {selectedEmails.length} email{selectedEmails.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="table-container overflow-x-auto">
            <table className="min-w-[1060px] table-fixed text-sm">
              <thead>
                <tr>
                  <th className="w-[70px]">Select</th>
                  <th className="w-[210px]">Student Email</th>
                  <th className="w-[245px]">Parent Email</th>
                  <th className="w-[165px]">Parent</th>
                  <th className="w-[175px]">Student</th>
                  <th className="w-[105px]">Student ID</th>
                  <th className="w-[135px]">Class</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <span className="mx-auto mb-3 block h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-transparent" style={{ borderTopColor: 'var(--primary-color)' }} />
                      <span className="text-sm font-semibold">Loading emails...</span>
                    </td>
                  </tr>
                ) : emailRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <Mail size={36} className="mx-auto mb-3 text-slate-300" />
                      <p className="font-medium text-slate-500">No emails found</p>
                    </td>
                  </tr>
                ) : visibleEmailRows.map((student: any) => {
                  const checked = selectedIds.has(student.id);
                  const marked = markedIds.has(student.id);
                  return (
                    <tr key={student.id} onClick={() => toggleStudent(student.id)} className={`cursor-pointer ${marked ? highlightStyles[highlightColor] : ''} ${checked ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                      <td>
                        <span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300'}`}>
                          {checked && <Check size={13} />}
                        </span>
                      </td>
                      <td className="min-w-0 font-semibold"><CellText value={getStudentEmail(student)} /></td>
                      <td className="min-w-0 font-semibold"><CellText value={getParentEmail(student)} /></td>
                      <td className="min-w-0">
                        <CellText value={student.guardianName || '-'} />
                        {marked && <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-300 dark:ring-slate-700">Marked</span>}
                      </td>
                      <td className="min-w-0"><CellText value={`${student.firstName} ${student.lastName}`} /></td>
                      <td className="min-w-0 font-mono text-xs"><CellText value={student.studentId || student.admissionNo || '-'} /></td>
                      <td className="min-w-0"><CellText value={getClassDisplayName(student.classId, classes)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ProgressiveListLoader hasMore={emailProgress.hasMore} loadingMore={emailProgress.loadingMore} onVisible={emailProgress.loadMore} />
          </div>
          {!listLoading && emailRows.length > visibleEmailRows.length && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-500">
                Showing {visibleEmailRows.length} of {emailRows.length} rows
              </p>
              <p className="text-xs font-semibold text-slate-400">Scroll down to load more.</p>
            </div>
          )}
        </section>

        <aside className="card h-fit min-w-0">
          <div className="card-header">
            <h2 className="font-bold text-slate-800 dark:text-white">Compose Email</h2>
            <p className="mt-1 text-xs text-slate-500">Uses your device email app with selected recipients in BCC.</p>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="form-label">Subject</label>
              <input value={subject} onChange={event => setSubject(event.target.value)} className="form-input" placeholder="Email subject" />
            </div>
            <div>
              <label className="form-label">Message</label>
              <textarea value={message} onChange={event => setMessage(event.target.value)} className="form-input min-h-40" placeholder="Write message..." />
            </div>
            <button onClick={sendEmails} className="btn btn-primary w-full justify-center" disabled={selectedEmails.length === 0}>
              <Send size={18} /> Send to Selected ({selectedEmails.length})
            </button>
            <button onClick={() => copyEmails(selectedEmails, 'selected')} className="btn btn-secondary w-full justify-center" disabled={selectedEmails.length === 0}>
              <Copy size={18} /> Copy Selected for Gmail
            </button>
            <button onClick={() => copyEmails(allFilteredEmails, 'filtered')} className="btn btn-secondary w-full justify-center" disabled={allFilteredEmails.length === 0}>
              <Copy size={18} /> Copy All
            </button>
          </div>
        </aside>
      </div>
      {showColorMenu && colorMenuRect && createPortal(
        <div
          data-mark-color-menu="true"
          className="fixed z-[999999] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          style={{ top: colorMenuRect.top, left: colorMenuRect.left, minWidth: colorMenuRect.width }}
        >
          {highlightOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setHighlightColor(option.value);
                setShowColorMenu(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${highlightColor === option.value ? 'text-primary-600 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200'}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${option.dot}`} />
              {option.label}
              {highlightColor === option.value && <Check size={14} className="ml-auto" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
