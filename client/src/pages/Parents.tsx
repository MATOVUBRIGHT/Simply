import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, GraduationCap, Mail, Phone, Search, Users } from 'lucide-react';
import type { Class, Student } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { getClassDisplayName } from '../utils/classroom';
import { matchesStudentSearch } from '../utils/studentSearch';
import { useMinimumLoading } from '../hooks/useMinimumLoading';

export default function Parents() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { data: studentsData, loading } = useTableData(sid, 'students');
  const { data: classesData } = useTableData(sid, 'classes');
  const students = studentsData as Student[];
  const classes = classesData as Class[];
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const listLoading = useMinimumLoading(loading, 2000);

  const parentRows = useMemo(() => students
    .filter((student: any) => student.guardianName || student.guardianPhone || student.guardianEmail)
    .filter((student: any) => matchesStudentSearch(student, search, [
      student.guardianName,
      student.guardianPhone,
      student.guardianEmail,
      getClassDisplayName(student.classId, classes),
    ])), [students, classes, search]);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(parentRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleParentRows = showAll ? parentRows : parentRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const parentStats = useMemo(() => ({
    parents: parentRows.length,
    phones: parentRows.filter((student: any) => student.guardianPhone).length,
    emails: parentRows.filter((student: any) => student.guardianEmail).length,
    classes: new Set(parentRows.map((student: any) => student.classId).filter(Boolean)).size,
  }), [parentRows]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function cellText(value: string) {
    return <span title={value} className="block min-w-0 truncate">{value || '-'}</span>;
  }

  return (
    <div className="max-w-full space-y-5 overflow-x-hidden animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Parents & Guardians</h1>
          <p className="mt-1 text-sm text-slate-500">Find parent details by student name, student ID, class, phone, or email.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link to="/parent-emails?mode=students" className="btn btn-secondary">
            <GraduationCap size={18} /> Student Emails
          </Link>
          <Link to="/parent-emails" className="btn btn-primary">
            <Mail size={18} /> Parent Emails
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Parents Listed', value: parentStats.parents, icon: Users, color: 'card-solid-indigo' },
          { label: 'Phone Contacts', value: parentStats.phones, icon: Phone, color: 'card-solid-emerald' },
          { label: 'Email Contacts', value: parentStats.emails, icon: Mail, color: 'card-solid-cyan' },
          { label: 'Classes Covered', value: parentStats.classes, icon: GraduationCap, color: 'card-solid-amber' },
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

      <div className="card min-w-0 overflow-hidden">
        <div className="card-header">
          <div className="relative">
            <Search size={18} className="search-input-icon" />
            <input
              value={search}
              onChange={event => handleSearch(event.target.value)}
              className="search-input"
              placeholder="Search student name, ID, parent, class, phone, email..."
            />
          </div>
        </div>
        <div className="table-container overflow-x-auto">
          <table className="min-w-[980px] table-fixed text-sm">
            <thead>
              <tr>
                <th className="w-[52px]">No.</th>
                <th className="w-[170px]">Parent / Guardian</th>
                <th className="w-[170px]">Student</th>
                <th className="w-[115px]">Student ID</th>
                <th className="w-[130px]">Class</th>
                <th className="w-[135px]">Phone</th>
                <th className="w-[235px]">Email</th>
                <th className="w-[90px] text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <span className="mx-auto mb-2 block h-7 w-7 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                    Loading parents...
                  </td>
                </tr>
              ) : parentRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <Users size={36} className="mx-auto mb-3 text-slate-300" />
                    <p className="font-medium text-slate-500">No parent details found</p>
                  </td>
                </tr>
              ) : visibleParentRows.map((student: any, index) => (
                <tr key={student.id}>
                  <td className="text-center text-xs font-semibold text-slate-400">{showAll ? index + 1 : (currentPage - 1) * pageSize + index + 1}</td>
                  <td className="min-w-0 font-semibold text-slate-800 dark:text-white">{cellText(student.guardianName || '-')}</td>
                  <td className="min-w-0">
                    <Link to={`/students/${student.id}`} className="font-medium text-primary-600 hover:underline">
                      {cellText(`${student.firstName} ${student.lastName}`)}
                    </Link>
                  </td>
                  <td className="min-w-0 font-mono text-xs">{cellText(student.studentId || student.admissionNo || '-')}</td>
                  <td className="min-w-0">{cellText(getClassDisplayName(student.classId, classes))}</td>
                  <td className="min-w-0">{cellText(student.guardianPhone || '-')}</td>
                  <td className="min-w-0">{cellText(student.guardianEmail || '-')}</td>
                  <td>
                    <div className="flex items-center justify-center gap-1.5">
                      {student.guardianPhone && (
                        <a
                          href={`tel:${student.guardianPhone}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-900/20"
                          title={`Call ${student.guardianName || 'guardian'}`}
                          aria-label={`Call ${student.guardianName || 'guardian'}`}
                        >
                          <Phone size={15} />
                        </a>
                      )}
                      {student.guardianEmail && (
                        <a
                          href={`mailto:${student.guardianEmail}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-900/20"
                          title={`Email ${student.guardianName || 'guardian'}`}
                          aria-label={`Email ${student.guardianName || 'guardian'}`}
                        >
                          <Mail size={15} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!listLoading && parentRows.length > pageSize && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-500">
              Showing {visibleParentRows.length} of {parentRows.length} parents
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setShowAll(value => !value)} className="btn btn-secondary py-1.5 text-sm">
                {showAll ? 'Show Pages' : 'Show All'}
              </button>
              {!showAll && (
                <>
                  <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage <= 1} className="btn btn-secondary py-1.5 text-sm disabled:opacity-50">
                    <ChevronLeft size={15} /> Prev
                  </button>
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {currentPage} / {totalPages}
                  </span>
                  <button type="button" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="btn btn-secondary py-1.5 text-sm disabled:opacity-50">
                    Next <ChevronRight size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
