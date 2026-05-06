import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, ArrowLeft, GraduationCap, Search, Check, Maximize2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useStudents } from '../contexts/StudentsContext';
import { exportToExcel } from '../utils/export';

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

function ordSuffix(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Threshold: if more than this many columns, show "View Full" button
const COMPACT_COL_LIMIT = 8;

export default function ExamMarks() {
  const { user, schoolId } = useAuth();
  const navigate = useNavigate();
  const sid = schoolId || user?.id || '';

  const { data: classes } = useTableData(sid, 'classes');
  const { data: subjects } = useTableData(sid, 'subjects');
  const { data: exams } = useTableData(sid, 'exams');
  const { data: examResults } = useTableData(sid, 'examResults');
  const { students: allStudents } = useStudents();

  const [filterClass, setFilterClass] = useState('');
  const [filterTerm, setFilterTerm] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [searchStudent, setSearchStudent] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [fullViewClassId, setFullViewClassId] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const sortedClasses = useMemo(() =>
    [...classes].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0)),
    [classes]
  );

  const availableExams = useMemo(() => {
    return (exams as any[]).filter(e => {
      if (filterTerm && String(e.term) !== filterTerm) return false;
      if (filterClass) {
        if (e.classId === filterClass) return true;
        const inClass = new Set(allStudents.filter(s => s.classId === filterClass).map(s => s.id));
        return (examResults as any[]).some(r => r.examId === e.id && inClass.has(r.studentId));
      }
      return true;
    }).sort((a: any, b: any) => {
      if (String(a.year) !== String(b.year)) return String(a.year).localeCompare(String(b.year));
      return String(a.term).localeCompare(String(b.term));
    });
  }, [exams, filterTerm, filterClass, allStudents, examResults]);

  // Deduplicated exam options for the dropdown — group by name+term+year
  const dedupedExamOptions = useMemo(() => {
    const seen = new Map<string, any>();
    for (const e of availableExams) {
      const key = `${e.name}||${e.term}||${e.year}`;
      if (!seen.has(key)) seen.set(key, e);
    }
    return Array.from(seen.values());
  }, [availableExams]);

  // When a deduped exam is selected, include ALL exam IDs with the same name+term+year
  const activeExamIds = useMemo(() => {
    const base = availableExams.map((e: any) => e.id);
    if (!filterExam) return base;
    // Find the selected exam's name+term+year
    const sel = availableExams.find((e: any) => e.id === filterExam);
    if (!sel) return base.includes(filterExam) ? [filterExam] : [];
    // Include all exams with same name+term+year
    return availableExams
      .filter((e: any) => e.name === sel.name && String(e.term) === String(sel.term) && String(e.year) === String(sel.year))
      .map((e: any) => e.id);
  }, [availableExams, filterExam]);

  const classGroups = useMemo(() => {
    const activeSet = new Set(activeExamIds);
    const classIdsWithResults = new Set<string>();
    for (const r of examResults as any[]) {
      if (!activeSet.has(r.examId)) continue;
      const student = allStudents.find(s => s.id === r.studentId);
      if (student?.classId) classIdsWithResults.add(student.classId);
    }

    const targetClassIds = filterClass
      ? (classIdsWithResults.has(filterClass) ? [filterClass] : [])
      : [...classIdsWithResults].sort((a, b) => {
          const la = (classes as any[]).find(c => c.id === a)?.level ?? 0;
          const lb = (classes as any[]).find(c => c.id === b)?.level ?? 0;
          return la - lb;
        });

    return targetClassIds.map(classId => {
      const cls = (classes as any[]).find(c => c.id === classId);
      const className = cls?.name || classId;

      const studentIdsWithResults = new Set(
        (examResults as any[])
          .filter(r => activeSet.has(r.examId))
          .filter(r => allStudents.find(s => s.id === r.studentId)?.classId === classId)
          .map(r => r.studentId)
      );

      let classStudents = allStudents.filter(s => s.classId === classId && s.status === 'active');
      const extra = allStudents.filter(s => studentIdsWithResults.has(s.id) && !classStudents.find(cs => cs.id === s.id));
      classStudents = [...classStudents, ...extra];

      if (searchStudent) {
        const q = searchStudent.toLowerCase();
        classStudents = classStudents.filter(s =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
          (s.studentId || s.admissionNo || '').toLowerCase().includes(q)
        );
      }

      if (classStudents.length === 0) return null;

      const classExams = (exams as any[]).filter(e => {
        if (!activeSet.has(e.id)) return false;
        return (examResults as any[]).some(r => r.examId === e.id && studentIdsWithResults.has(r.studentId));
      }).sort((a: any, b: any) => {
        if (String(a.year) !== String(b.year)) return String(a.year).localeCompare(String(b.year));
        if (String(a.term) !== String(b.term)) return String(a.term).localeCompare(String(b.term));
        return String(a.name).localeCompare(String(b.name));
      });

      if (classExams.length === 0) return null;

      const classSubjects = (subjects as any[]).filter(s => s.classId === classId);
      const subjectIdsInResults = new Set(
        (examResults as any[])
          .filter(r => activeSet.has(r.examId) && studentIdsWithResults.has(r.studentId))
          .map(r => r.subjectId).filter(Boolean)
      );
      const extraSubs = (subjects as any[]).filter(s =>
        subjectIdsInResults.has(s.id) && !classSubjects.find((cs: any) => cs.id === s.id)
      );
      const nameOnlySubs = [...new Set(
        (examResults as any[])
          .filter(r => activeSet.has(r.examId) && studentIdsWithResults.has(r.studentId) && r.subjectName && !r.subjectId)
          .map(r => r.subjectName as string)
      )].map(name => ({ id: `name:${name}`, name, code: '' }));
      const allSubjects = [...classSubjects, ...extraSubs, ...nameOnlySubs];

      const matrix = classStudents.map(student => {
        const row: any = { student, examTotals: {}, examAvgs: {}, examGrades: {} };
        let grandTotal = 0; let grandCount = 0;
        for (const exam of classExams) {
          const resultsForExam = (examResults as any[]).filter(r => r.examId === exam.id && r.studentId === student.id);
          let examTotal = 0; let examCount = 0;
          for (const sub of allSubjects) {
            const result = sub.id.startsWith('name:')
              ? resultsForExam.find(r => r.subjectName === sub.name)
              : resultsForExam.find(r => r.subjectId === sub.id);
            const score = result ? Number(result.score) : null;
            row[`${exam.id}::${sub.id}`] = score;
            if (score !== null) { examTotal += score; examCount++; grandTotal += score; grandCount++; }
          }
          row.examTotals[exam.id] = examCount > 0 ? examTotal : null;
          row.examAvgs[exam.id] = examCount > 0 ? Math.round(examTotal / examCount) : null;
          row.examGrades[exam.id] = examCount > 0 ? getGrade(Math.round(examTotal / examCount)) : '-';
        }
        row.grandTotal = grandCount > 0 ? grandTotal : null;
        row.grandAvg = grandCount > 0 ? Math.round(grandTotal / grandCount) : null;
        row.grade = row.grandAvg !== null ? getGrade(row.grandAvg) : '-';
        return row;
      }).sort((a, b) => (b.grandAvg ?? -1) - (a.grandAvg ?? -1));

      matrix.forEach((row, i) => { row.position = i + 1; });

      // Pick the most recent exam for the Report button
      const latestExam = classExams[classExams.length - 1];

      return { classId, className, classExams, allSubjects, matrix, latestExam };
    }).filter(Boolean) as {
      classId: string; className: string;
      classExams: any[]; allSubjects: any[]; matrix: any[]; latestExam: any;
    }[];
  }, [activeExamIds, examResults, allStudents, subjects, classes, exams, filterClass, searchStudent]);

  const hasResults = classGroups.some(g => g.matrix.length > 0);

  const allDisplayedStudents = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    for (const g of classGroups) {
      for (const row of g.matrix) {
        if (!seen.has(row.student.id)) { seen.add(row.student.id); list.push(row.student); }
      }
    }
    return list;
  }, [classGroups]);

  function toggleStudent(id: string) {
    setSelectedStudents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() {
    if (selectedStudents.size === allDisplayedStudents.length) setSelectedStudents(new Set());
    else setSelectedStudents(new Set(allDisplayedStudents.map(s => s.id)));
  }

  function getExportData() {
    const rows: any[] = [];
    for (const g of classGroups) {
      const toExport = selectedStudents.size > 0 ? g.matrix.filter(r => selectedStudents.has(r.student.id)) : g.matrix;
      for (const row of toExport) {
        const base: any = { Name: `${row.student.firstName} ${row.student.lastName}`, ID: row.student.studentId || row.student.admissionNo, Class: g.className };
        for (const exam of g.classExams) {
          for (const sub of g.allSubjects) base[`${exam.name} - ${sub.name}`] = row[`${exam.id}::${sub.id}`] ?? '';
          base[`${exam.name} Total`] = row.examTotals[exam.id] ?? '';
          base[`${exam.name} Avg%`] = row.examAvgs[exam.id] ?? '';
        }
        base['Grand Total'] = row.grandTotal ?? '';
        base['Overall Avg%'] = row.grandAvg ?? '';
        base['Grade'] = row.grade;
        base['Position'] = row.position ? `${row.position}${ordSuffix(row.position)} / ${g.matrix.length}` : '';
        rows.push(base);
      }
    }
    return rows;
  }

  function handleExportCSV() {
    const data = getExportData(); if (!data.length) return;
    const keys = Object.keys(data[0]);
    const csv = [keys.join(','), ...data.map(r => keys.map(k => `"${r[k] ?? ''}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'exam-marks.csv'; a.click();
    setShowExportMenu(false);
  }
  function handleExportExcel() {
    const data = getExportData(); if (!data.length) return;
    const keys = Object.keys(data[0]);
    exportToExcel(data, 'exam-marks', keys.map(k => ({ key: k as any, label: k })));
    setShowExportMenu(false);
  }

  const fullViewGroup = fullViewClassId ? classGroups.find(g => g.classId === fullViewClassId) : null;

  // Reusable table renderer
  function renderTable(group: typeof classGroups[0], compact = false) {
    const { classExams, allSubjects, matrix, latestExam } = group;
    const visibleMatrix = selectedStudents.size > 0 && !compact
      ? matrix.filter(r => selectedStudents.has(r.student.id))
      : matrix;
    if (visibleMatrix.length === 0) return null;

    const fixedCols = compact ? 2 : 3; // checkbox(optional) + # + Student

    return (
      <div>
        {/* ── Scrollable per-exam scores ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse"
            style={{ minWidth: `${Math.max(400, (classExams.length * (allSubjects.length + 3) + fixedCols) * 52)}px` }}>
            <thead>
              <tr className="bg-teal-800 text-white">
                {!compact && <th className="px-2 py-2 print:hidden" rowSpan={2} />}
                <th className="px-3 py-2 text-left font-semibold" rowSpan={2}>#</th>
                <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" rowSpan={2}>Student</th>
                {classExams.map(exam => (
                  <th key={exam.id} colSpan={allSubjects.length + 3}
                    className="px-3 py-1.5 text-center font-semibold border-l border-teal-600 text-xs whitespace-nowrap">
                    {exam.name} · T{exam.term} {exam.year}
                  </th>
                ))}
              </tr>
              <tr className="bg-teal-700 text-white">
                {classExams.map(exam => (
                  <>
                    {allSubjects.map((sub: any) => (
                      <th key={`${exam.id}-${sub.id}`}
                        className="px-2 py-1.5 text-center font-medium text-[11px] whitespace-nowrap border-l border-teal-600 min-w-[44px]">
                        {sub.name}
                        {sub.code && <div className="font-normal text-[9px] opacity-70">{sub.code}</div>}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-center font-semibold text-xs border-l border-teal-500 bg-teal-600">Tot</th>
                    <th className="px-2 py-1.5 text-center font-semibold text-xs bg-teal-600">Avg%</th>
                    <th className="px-2 py-1.5 text-center font-semibold text-xs bg-teal-600">Grd</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleMatrix.map((row, i) => (
                <tr key={row.student.id}
                  className={`${i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-800/50'} ${!compact && selectedStudents.has(row.student.id) ? 'ring-1 ring-inset ring-indigo-400' : ''}`}>
                  {!compact && (
                    <td className="px-2 py-2 text-center print:hidden">
                      <div className={`w-4 h-4 rounded border-2 mx-auto flex items-center justify-center cursor-pointer ${selectedStudents.has(row.student.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}
                        onClick={() => toggleStudent(row.student.id)}>
                        {selectedStudents.has(row.student.id) && <Check size={10} className="text-white" />}
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-white whitespace-nowrap">
                    {row.student.firstName} {row.student.lastName}
                  </td>
                  {classExams.map((exam: any) => (
                    <>
                      {allSubjects.map((sub: any) => {
                        const score = row[`${exam.id}::${sub.id}`];
                        return (
                          <td key={`${exam.id}-${sub.id}`} className="px-2 py-2 text-center border-l border-slate-100 dark:border-slate-700">
                            {score !== null && score !== undefined
                              ? <span className="font-medium">{score}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-semibold border-l border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 text-xs">{row.examTotals[exam.id] ?? '—'}</td>
                      <td className="px-2 py-2 text-center text-xs bg-slate-50 dark:bg-slate-700/30">{row.examAvgs[exam.id] != null ? `${row.examAvgs[exam.id]}%` : '—'}</td>
                      <td className={`px-2 py-2 text-center text-xs bg-slate-50 dark:bg-slate-700/30 ${gradeColor(row.examGrades[exam.id] ?? '-')}`}>{row.examGrades[exam.id] ?? '—'}</td>
                    </>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Overall summary — fixed below, no horizontal scroll ── */}
        <div className="border-t-2 border-teal-700 dark:border-teal-600">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-teal-900 text-white">
                {!compact && <th className="px-2 py-2 print:hidden w-8" />}
                <th className="px-3 py-2 text-left font-semibold w-8">#</th>
                <th className="px-3 py-2 text-left font-semibold">Student</th>
                <th className="px-3 py-2 text-center font-semibold">Total</th>
                <th className="px-3 py-2 text-center font-semibold">Avg %</th>
                <th className="px-3 py-2 text-center font-semibold">Grade</th>
                <th className="px-3 py-2 text-center font-semibold">Position</th>
                <th className="px-3 py-2 text-center font-semibold print:hidden">Report</th>
              </tr>
            </thead>
            <tbody>
              {visibleMatrix.map((row, i) => (
                <tr key={`overall-${row.student.id}`}
                  className={`${i % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-800'} ${!compact && selectedStudents.has(row.student.id) ? 'ring-1 ring-inset ring-indigo-400' : ''}`}>
                  {!compact && <td className="px-2 py-2 print:hidden" />}
                  <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-white whitespace-nowrap">
                    {row.student.firstName} {row.student.lastName}
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-teal-700 dark:text-teal-300">
                    {row.grandTotal ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-teal-700 dark:text-teal-300">
                    {row.grandAvg != null ? `${row.grandAvg}%` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-center font-bold ${gradeColor(row.grade)}`}>
                    {row.grade}
                  </td>
                  <td className="px-3 py-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {row.position ? `${row.position}${ordSuffix(row.position)} / ${matrix.length}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center print:hidden">
                    <button
                      onClick={() => navigate(`/report-card/${row.student.id}${latestExam ? `?exam=${latestExam.id}` : ''}`)}
                      className="text-xs px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <FileText size={11} /> Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 print:hidden">
        <button onClick={() => navigate('/grades')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Exam Marks & Reports</h1>
          <p className="text-sm text-slate-500 mt-1">All exams per class — one row per student</p>
        </div>
        {hasResults && (
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu(v => !v)} className="btn btn-primary flex items-center gap-2">
              <Download size={16} /> Export {selectedStudents.size > 0 ? `(${selectedStudents.size})` : 'All'}
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                <button onClick={handleExportCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"><FileText size={14} /> Export CSV</button>
                <button onClick={handleExportExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"><FileText size={14} /> Export Excel</button>
                <button onClick={() => { window.print(); setShowExportMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"><Download size={14} /> Print / PDF</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
        <div>
          <label className="form-label">Class</label>
          <select value={filterClass} onChange={e => { setFilterClass(e.target.value); setFilterExam(''); }} className="form-input">
            <option value="">All Classes</option>
            {sortedClasses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Term</label>
          <select value={filterTerm} onChange={e => { setFilterTerm(e.target.value); setFilterExam(''); }} className="form-input">
            <option value="">All Terms</option>
            <option value="1">Term 1</option>
            <option value="2">Term 2</option>
            <option value="3">Term 3</option>
          </select>
        </div>
        <div>
          <label className="form-label">Exam</label>
          <select value={filterExam} onChange={e => setFilterExam(e.target.value)} className="form-input">
            <option value="">All Exams</option>
            {dedupedExamOptions.map((e: any) => <option key={e.id} value={e.id}>{e.name} · T{e.term} {e.year}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Search Student</label>
          <div className="relative">
            <Search size={16} className="search-input-icon" />
            <input value={searchStudent} onChange={e => setSearchStudent(e.target.value)} placeholder="Name or ID..." className="search-input" />
          </div>
        </div>
      </div>

      {/* Select-all bar */}
      {hasResults && (
        <div className="flex items-center gap-3 px-1 print:hidden">
          <button onClick={selectAll} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selectedStudents.size === allDisplayedStudents.length && allDisplayedStudents.length > 0 ? 'bg-indigo-600 border-indigo-600' : 'border-slate-400'}`}>
              {selectedStudents.size === allDisplayedStudents.length && allDisplayedStudents.length > 0 && <Check size={10} className="text-white" />}
            </div>
            {selectedStudents.size > 0 ? `${selectedStudents.size} selected` : 'Select all'}
          </button>
          {selectedStudents.size > 0 && <button onClick={() => setSelectedStudents(new Set())} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>}
        </div>
      )}

      {/* Empty states */}
      {(examResults as any[]).length === 0 ? (
        <div className="card p-12 text-center">
          <GraduationCap size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No exam results yet</p>
          <p className="text-sm text-slate-400 mt-1">Add grades from the Grades page</p>
        </div>
      ) : !hasResults ? (
        <div className="card p-12 text-center">
          <GraduationCap size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No results match the current filters</p>
        </div>
      ) : classGroups.map(group => {
        const { classId, className, classExams, allSubjects, matrix } = group;
        const visibleMatrix = selectedStudents.size > 0 ? matrix.filter(r => selectedStudents.has(r.student.id)) : matrix;
        if (visibleMatrix.length === 0) return null;
        const totalCols = classExams.length * (allSubjects.length + 3) + 5;
        const isWide = totalCols > COMPACT_COL_LIMIT;

        return (
          <div key={classId} className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-bold text-slate-800 dark:text-white text-lg">{className}</h2>
                <p className="text-sm text-slate-500">
                  {classExams.length} exam{classExams.length !== 1 ? 's' : ''} · {visibleMatrix.length} student{visibleMatrix.length !== 1 ? 's' : ''} · {allSubjects.length} subject{allSubjects.length !== 1 ? 's' : ''}
                </p>
              </div>
              {isWide && (
                <button onClick={() => setFullViewClassId(classId)}
                  className="btn btn-secondary flex items-center gap-2 text-sm print:hidden">
                  <Maximize2 size={15} /> View Full
                </button>
              )}
            </div>
            {renderTable(group)}
          </div>
        );
      })}

      {/* Full-screen modal for wide tables */}
      {fullViewGroup && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex flex-col print:hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-teal-800 text-white shrink-0">
            <div>
              <h2 className="font-bold text-lg">{fullViewGroup.className}</h2>
              <p className="text-sm text-teal-200">{fullViewGroup.classExams.length} exam{fullViewGroup.classExams.length !== 1 ? 's' : ''} · {fullViewGroup.matrix.length} students · {fullViewGroup.allSubjects.length} subjects</p>
            </div>
            <button onClick={() => setFullViewClassId(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X size={22} className="text-white" />
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 p-2">
            {renderTable(fullViewGroup, true)}
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { margin: 8mm; size: A4 landscape; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
