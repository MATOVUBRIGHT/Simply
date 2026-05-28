import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, GraduationCap, Mail, Search, Send, Square, Users } from 'lucide-react';
import type { Class, Student } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTableData } from '../lib/store';
import { getClassDisplayName } from '../utils/classroom';
import { matchesStudentSearch } from '../utils/studentSearch';

type EmailMode = 'parents' | 'students' | 'both';

function getStudentEmail(student: any) {
  return String(student.email || student.studentEmail || '').trim();
}

function getParentEmail(student: any) {
  return String(student.guardianEmail || '').trim();
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
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

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
  const allVisibleSelected = emailRows.length > 0 && emailRows.every((student: any) => selectedIds.has(student.id));
  const selectedEmails = Array.from(new Set(selectedRows.flatMap((student: any) => emailsForStudent(student)).filter(Boolean)));
  const visibleEmails = Array.from(new Set(emailRows.flatMap((student: any) => emailsForStudent(student)).filter(Boolean)));

  function toggleStudent(studentId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(studentId) ? next.delete(studentId) : next.add(studentId);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        emailRows.forEach((student: any) => next.delete(student.id));
      } else {
        emailRows.forEach((student: any) => next.add(student.id));
      }
      return next;
    });
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

      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card min-w-0 overflow-hidden">
          <div className="card-header space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px_210px]">
              <div className="relative">
                <Search size={18} className="search-input-icon" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  className="search-input"
                  placeholder="Search by student name, ID, parent, email..."
                />
              </div>
              <select value={filterClassId} onChange={event => setFilterClassId(event.target.value)} className="form-input form-select">
                <option value="all">All Classes</option>
                {classes.map(classItem => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}
              </select>
              <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white text-xs font-bold dark:border-slate-700 dark:bg-slate-800">
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
                    className={`flex min-h-10 items-center justify-center gap-1 px-2 transition-colors ${emailMode === mode ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button onClick={toggleVisible} className="btn btn-secondary py-1.5 text-sm">
                  {allVisibleSelected ? <Check size={16} /> : <Square size={16} />}
                  {allVisibleSelected ? 'Deselect visible' : 'Select visible'}
                </button>
                <button onClick={() => copyEmails(selectedEmails, 'selected')} className="btn btn-secondary py-1.5 text-sm" disabled={selectedEmails.length === 0}>
                  <Copy size={16} /> Copy Selected
                </button>
                <button onClick={() => copyEmails(visibleEmails, 'visible')} className="btn btn-secondary py-1.5 text-sm" disabled={visibleEmails.length === 0}>
                  <Copy size={16} /> Copy All Visible
                </button>
              </div>
              <span className="min-w-0 text-sm font-semibold text-slate-500">{selectedRows.length} student{selectedRows.length === 1 ? '' : 's'} selected - {selectedEmails.length} email{selectedEmails.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="table-container !overflow-x-hidden">
            <table className="!min-w-0 table-fixed">
              <thead>
                <tr>
                  <th className="w-14">Select</th>
                  <th className="w-[18%]">Student Email</th>
                  <th className="w-[18%]">Parent Email</th>
                  <th className="w-[15%]">Parent</th>
                  <th className="w-[15%]">Student</th>
                  <th className="w-[13%]">Student ID</th>
                  <th className="w-[13%]">Class</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="py-12 text-center text-slate-400">Loading emails...</td></tr>
                ) : emailRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <Mail size={36} className="mx-auto mb-3 text-slate-300" />
                      <p className="font-medium text-slate-500">No emails found</p>
                    </td>
                  </tr>
                ) : emailRows.map((student: any) => {
                  const checked = selectedIds.has(student.id);
                  return (
                    <tr key={student.id} onClick={() => toggleStudent(student.id)} className={`cursor-pointer ${checked ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}>
                      <td>
                        <span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300'}`}>
                          {checked && <Check size={13} />}
                        </span>
                      </td>
                      <td className="break-words font-semibold">{getStudentEmail(student) || '-'}</td>
                      <td className="break-words font-semibold">{getParentEmail(student) || '-'}</td>
                      <td className="break-words">{student.guardianName || '-'}</td>
                      <td className="break-words">{student.firstName} {student.lastName}</td>
                      <td className="break-words font-mono text-xs">{student.studentId || student.admissionNo || '-'}</td>
                      <td className="break-words">{getClassDisplayName(student.classId, classes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
            <button onClick={() => copyEmails(visibleEmails, 'visible')} className="btn btn-secondary w-full justify-center" disabled={visibleEmails.length === 0}>
              <Copy size={18} /> Copy All Visible
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
