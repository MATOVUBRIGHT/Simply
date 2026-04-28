import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, ArrowLeft, Filter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useStudents } from '../contexts/StudentsContext';
import { useCurrency } from '../hooks/useCurrency';

function getGrade(score: number): string {
  if (score >= 90) return 'D1';
  if (score >= 85) return 'D2';
  if (score >= 80) return 'C3';
  if (score >= 75) return 'C4';
  if (score >= 70) return 'C5';
  if (score >= 65) return 'C6';
  if (score >= 60) return 'P7';
  if (score >= 50) return 'P8';
  return 'F9';
}

function gradeColor(grade: string): string {
  if (grade.startsWith('D')) return 'text-emerald-600 font-bold';
  if (grade.startsWith('C')) return 'text-blue-600 font-semibold';
  if (grade.startsWith('P')) return 'text-amber-600';
  return 'text-red-600 font-bold';
}

export default function ExamMarks() {
  const { user, schoolId } = useAuth();
  const navigate = useNavigate();
  const sid = schoolId || user?.id || '';

  const { data: classes } = useTableData(sid, 'classes');
  const { data: subjects } = useTableData(sid, 'subjects');
  const { data: exams } = useTableData(sid, 'exams');
  const { data: examResults } = useTableData(sid, 'examResults');
  const { students: allStudents } = useStudents();

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('all');

  const sortedClasses = useMemo(() =>
    [...classes].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0)),
    [classes]
  );

  const filteredExams = useMemo(() =>
    exams.filter((e: any) =>
      (!selectedClass || e.classId === selectedClass) &&
      (selectedTerm === 'all' || e.term === selectedTerm)
    ),
    [exams, selectedClass, selectedTerm]
  );

  const currentExam = exams.find((e: any) => e.id === selectedExam) as any;
  const classStudents = useMemo(() =>
    allStudents.filter(s => s.classId === (currentExam?.classId || selectedClass) && s.status === 'active'),
    [allStudents, currentExam, selectedClass]
  );

  const classSubjects = useMemo(() =>
    subjects.filter((s: any) => s.classId === (currentExam?.classId || selectedClass)),
    [subjects, currentExam, selectedClass]
  );

  // Build marks matrix: student × subject
  const marksMatrix = useMemo(() => {
    if (!selectedExam) return [];
    return classStudents.map(student => {
      const row: any = { student };
      let total = 0; let count = 0;
      for (const sub of classSubjects) {
        const result = examResults.find((r: any) => r.examId === selectedExam && r.studentId === student.id && r.subjectId === sub.id) as any;
        const score = result ? Number(result.score) : null;
        row[sub.id] = score;
        if (score !== null) { total += score; count++; }
      }
      row.total = count > 0 ? total : null;
      row.avg = count > 0 ? Math.round(total / count) : null;
      row.grade = row.avg !== null ? getGrade(row.avg) : '-';
      return row;
    }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [classStudents, classSubjects, examResults, selectedExam]);

  function handlePrint() {
    window.print();
  }

  const className = sortedClasses.find((c: any) => c.id === (currentExam?.classId || selectedClass))?.name || '';

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/grades')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Exam Marks</h1>
          <p className="text-sm text-slate-500 mt-1">View marks per class and generate report cards</p>
        </div>
        {selectedExam && (
          <button onClick={handlePrint} className="btn btn-secondary flex items-center gap-2">
            <Download size={16} /> Print / Export PDF
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-40">
          <label className="form-label">Class</label>
          <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedExam(''); }} className="form-input">
            <option value="">All Classes</option>
            {sortedClasses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-32">
          <label className="form-label">Term</label>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="form-input">
            <option value="all">All Terms</option>
            <option value="1">Term 1</option>
            <option value="2">Term 2</option>
            <option value="3">Term 3</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="form-label">Exam</label>
          <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)} className="form-input">
            <option value="">Select Exam</option>
            {filteredExams.map((e: any) => <option key={e.id} value={e.id}>{e.name} — Term {e.term} {e.year}</option>)}
          </select>
        </div>
      </div>

      {/* Marks Table */}
      {selectedExam && marksMatrix.length > 0 ? (
        <div className="card overflow-hidden" id="marks-table">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800 dark:text-white">{currentExam?.name} — {className}</h2>
              <p className="text-sm text-slate-500">Term {currentExam?.term} · {currentExam?.year} · {marksMatrix.length} students</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-teal-700 text-white">
                  <th className="px-3 py-2 text-left font-semibold">#</th>
                  <th className="px-3 py-2 text-left font-semibold">Student</th>
                  {classSubjects.map((s: any) => (
                    <th key={s.id} className="px-3 py-2 text-center font-semibold whitespace-nowrap">{s.name}</th>
                  ))}
                  <th className="px-3 py-2 text-center font-semibold">Total</th>
                  <th className="px-3 py-2 text-center font-semibold">Avg%</th>
                  <th className="px-3 py-2 text-center font-semibold">Grade</th>
                  <th className="px-3 py-2 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {marksMatrix.map((row, i) => (
                  <tr key={row.student.id} className={i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/50'}>
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-white whitespace-nowrap">
                      {row.student.firstName} {row.student.lastName}
                    </td>
                    {classSubjects.map((s: any) => (
                      <td key={s.id} className="px-3 py-2 text-center">
                        {row[s.id] !== null ? row[s.id] : <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center font-semibold">{row.total ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-semibold">{row.avg ?? '—'}</td>
                    <td className={`px-3 py-2 text-center ${gradeColor(row.grade)}`}>{row.grade}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => navigate(`/report-card/${row.student.id}?exam=${selectedExam}`)}
                        className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg flex items-center gap-1 mx-auto"
                      >
                        <FileText size={12} /> Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedExam ? (
        <div className="card p-12 text-center">
          <GraduationCap size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">No marks recorded for this exam yet.</p>
          <p className="text-sm text-slate-400 mt-1">Go to Grades to enter marks.</p>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <Filter size={48} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">Select a class and exam to view marks.</p>
        </div>
      )}
    </div>
  );
}

// Need this import
function GraduationCap({ size, className }: { size: number; className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>;
}
