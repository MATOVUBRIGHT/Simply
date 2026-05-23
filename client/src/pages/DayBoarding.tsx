import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, Home, Users, Search, GraduationCap } from 'lucide-react';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { getBoardingStatus } from '../utils/studentBoarding';
import { matchesStudentSearch } from '../utils/studentSearch';

export default function DayBoarding() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const students = useActiveStudents();
  const { data: classesData } = useTableData(sid, 'classes');
  const [search, setSearch] = useState('');

  const className = (classId?: string) => (classesData as any[]).find(c => c.id === classId)?.name || 'No class';
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((student: any) => {
      if (!q) return true;
      return matchesStudentSearch(student, q, [className(student.classId)]);
    });
  }, [students, search, classesData]);

  const groups = useMemo(() => {
    const make = () => ({ boys: [] as any[], girls: [] as any[] });
    const next = { day: make(), boarding: make() };
    filtered.forEach((student: any) => {
      const status = getBoardingStatus(student);
      const gender = String(student.gender || '').toLowerCase() === 'female' ? 'girls' : 'boys';
      next[status][gender].push(student);
    });
    return next;
  }, [filtered]);

  const renderList = (title: string, list: any[]) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between">
        <p className="font-semibold text-slate-800 dark:text-white">{title}</p>
        <span className="badge badge-info">{list.length}</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[420px] overflow-y-auto">
        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">No students</p>
        ) : list.map(student => (
          <Link key={student.id} to={`/students/${student.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
            <div className="min-w-0">
              <p className="font-medium text-slate-800 dark:text-white truncate">{student.firstName} {student.lastName}</p>
              <p className="text-xs text-slate-500 truncate">{student.studentId || student.admissionNo || 'No ID'} · {className(student.classId)}</p>
            </div>
            <GraduationCap size={16} className="text-slate-400 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );

  const dayTotal = groups.day.boys.length + groups.day.girls.length;
  const boardingTotal = groups.boarding.boys.length + groups.boarding.girls.length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Day & Boarding</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Students separated by day or boarding, boys and girls.</p>
        </div>
        <div className="relative">
          <Search size={18} className="search-input-icon" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..." className="search-input w-full sm:w-64" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Users size={24} className="text-white" /></div>
            <div><p className="text-sm font-medium text-white/80">Total Students</p><p className="text-2xl font-bold text-white">{filtered.length}</p></div>
          </div>
        </div>
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Home size={24} className="text-white" /></div>
            <div><p className="text-sm font-medium text-white/80">Day</p><p className="text-2xl font-bold text-white">{dayTotal}</p></div>
          </div>
        </div>
        <div className="card-solid-violet p-5 rounded-2xl shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><BedDouble size={24} className="text-white" /></div>
            <div><p className="text-sm font-medium text-white/80">Boarding</p><p className="text-2xl font-bold text-white">{boardingTotal}</p></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2"><Home size={20} className="text-emerald-500" /> Day Students</h2>
            <span className="badge badge-success">{dayTotal}</span>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderList('Boys', groups.day.boys)}
            {renderList('Girls', groups.day.girls)}
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2"><BedDouble size={20} className="text-violet-500" /> Boarding Students</h2>
            <span className="badge badge-info">{boardingTotal}</span>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderList('Boys', groups.boarding.boys)}
            {renderList('Girls', groups.boarding.girls)}
          </div>
        </section>
      </div>
    </div>
  );
}
