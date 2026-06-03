import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Mail, Phone, Search, Users } from 'lucide-react';
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
  const listLoading = useMinimumLoading(loading, 2000);

  const parentRows = students
    .filter((student: any) => student.guardianName || student.guardianPhone || student.guardianEmail)
    .filter((student: any) => matchesStudentSearch(student, search, [
      student.guardianName,
      student.guardianPhone,
      student.guardianEmail,
      getClassDisplayName(student.classId, classes),
    ]));

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

      <div className="card min-w-0 overflow-hidden">
        <div className="card-header">
          <div className="relative">
            <Search size={18} className="search-input-icon" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="search-input"
              placeholder="Search student name, ID, parent, class, phone, email..."
            />
          </div>
        </div>
        <div className="table-container !overflow-x-hidden">
          <table className="!min-w-0 table-fixed">
            <thead>
              <tr>
                <th className="w-12">No.</th>
                <th className="w-[18%]">Parent / Guardian</th>
                <th className="w-[17%]">Student</th>
                <th className="w-[12%]">Student ID</th>
                <th className="w-[12%]">Class</th>
                <th className="w-[13%]">Phone</th>
                <th className="w-[18%]">Email</th>
                <th className="w-[8%] text-center">Action</th>
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
              ) : parentRows.map((student: any, index) => (
                <tr key={student.id}>
                  <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                  <td className="break-words font-semibold text-slate-800 dark:text-white">{student.guardianName || '-'}</td>
                  <td className="break-words">
                    <Link to={`/students/${student.id}`} className="font-medium text-primary-600 hover:underline">
                      {student.firstName} {student.lastName}
                    </Link>
                  </td>
                  <td className="break-words font-mono text-xs">{student.studentId || student.admissionNo || '-'}</td>
                  <td className="break-words">{getClassDisplayName(student.classId, classes)}</td>
                  <td className="break-words">{student.guardianPhone || '-'}</td>
                  <td className="break-words">{student.guardianEmail || '-'}</td>
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
      </div>
    </div>
  );
}
