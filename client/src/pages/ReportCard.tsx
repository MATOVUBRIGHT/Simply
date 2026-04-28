import { useMemo, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useStudents } from '../contexts/StudentsContext';

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

function getRemark(grade: string): string {
  if (grade.startsWith('D')) return 'Distinction';
  if (grade.startsWith('C')) return 'Credit';
  if (grade.startsWith('P')) return 'Pass';
  return 'Fail';
}

export default function ReportCard() {
  const { id: studentId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam') || '';
  const navigate = useNavigate();
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const printRef = useRef<HTMLDivElement>(null);

  const { data: exams } = useTableData(sid, 'exams');
  const { data: examResults } = useTableData(sid, 'examResults');
  const { data: subjects } = useTableData(sid, 'subjects');
  const { data: classes } = useTableData(sid, 'classes');
  const { data: settings } = useTableData(sid, 'settings');
  const { students: allStudents } = useStudents();

  const student = allStudents.find(s => s.id === studentId);
  const exam = exams.find((e: any) => e.id === examId) as any;
  const className = classes.find((c: any) => c.id === student?.classId)?.name || '';

  const settingsMap = useMemo(() => {
    const m: Record<string, string> = {};
    settings.forEach((s: any) => { m[s.key] = s.value; });
    return m;
  }, [settings]);

  const schoolName = settingsMap.schoolName || 'School Name';
  const academicYear = settingsMap.academicYear || new Date().getFullYear().toString();

  const classSubjects = useMemo(() =>
    subjects.filter((s: any) => s.classId === student?.classId),
    [subjects, student]
  );

  const studentResults = useMemo(() => {
    if (!examId || !studentId) return [];
    return classSubjects.map(sub => {
      const result = examResults.find((r: any) => r.examId === examId && r.studentId === studentId && r.subjectId === sub.id) as any;
      const score = result ? Number(result.score) : null;
      const maxScore = result ? Number(result.maxScore || 100) : 100;
      const pct = score !== null ? Math.round((score / maxScore) * 100) : null;
      const grade = pct !== null ? getGrade(pct) : '—';
      return {
        subject: sub.name,
        score,
        maxScore,
        pct,
        grade,
        remark: pct !== null ? getRemark(grade) : '—',
        remarks: result?.remarks || '',
      };
    });
  }, [classSubjects, examResults, examId, studentId]);

  const totalScore = studentResults.reduce((s, r) => s + (r.score ?? 0), 0);
  const totalMax = studentResults.reduce((s, r) => s + r.maxScore, 0);
  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const overallGrade = getGrade(overallPct);

  function handlePrint() {
    window.print();
  }

  if (!student) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Student not found.</p>
        <button onClick={() => navigate(-1)} className="btn btn-secondary mt-4">Go Back</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center gap-4 print:hidden">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white flex-1">Report Card</h1>
        <button onClick={handlePrint} className="btn btn-primary flex items-center gap-2">
          <Download size={16} /> Export PDF
        </button>
      </div>

      {/* Report Card — matches template */}
      <div ref={printRef} className="bg-white mx-auto max-w-2xl shadow-xl print:shadow-none print:max-w-full" style={{ fontFamily: 'Arial, sans-serif' }}>

        {/* Header */}
        <div className="p-6" style={{ backgroundColor: '#1a5f5f' }}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-black text-white uppercase tracking-wide">{schoolName}</h1>
              <h2 className="text-xl font-bold mt-1" style={{ color: '#7ecece' }}>REPORT CARD</h2>
            </div>
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-3xl">🎓</div>
          </div>
        </div>

        {/* Student Info */}
        <div className="px-6 py-4 border-b-2" style={{ borderColor: '#7ecece' }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-slate-700 whitespace-nowrap">Name of Student:</span>
              <span className="flex-1 px-3 py-1 text-sm font-medium" style={{ backgroundColor: '#d4eaea' }}>
                {student.firstName} {student.lastName}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-slate-700 whitespace-nowrap">Admission No:</span>
              <span className="flex-1 px-3 py-1 text-sm" style={{ backgroundColor: '#d4eaea' }}>{student.admissionNo}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-slate-700 whitespace-nowrap">School Year:</span>
              <span className="px-3 py-1 text-sm" style={{ backgroundColor: '#d4eaea' }}>{academicYear}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-slate-700 whitespace-nowrap">Class:</span>
              <span className="flex-1 px-3 py-1 text-sm" style={{ backgroundColor: '#d4eaea' }}>{className}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-slate-700 whitespace-nowrap">Exam:</span>
              <span className="flex-1 px-3 py-1 text-sm" style={{ backgroundColor: '#d4eaea' }}>{exam?.name || '—'}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-slate-700 whitespace-nowrap">Term:</span>
              <span className="px-3 py-1 text-sm" style={{ backgroundColor: '#d4eaea' }}>Term {exam?.term} · {exam?.year}</span>
            </div>
          </div>
        </div>

        {/* Marks Table */}
        <div className="px-6 py-4">
          <div className="h-2 mb-3 rounded" style={{ backgroundColor: '#7ecece' }} />
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ backgroundColor: '#1a5f5f', color: 'white' }}>
                <th className="px-3 py-2 text-left font-bold uppercase text-xs">Subject</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-xs">Score</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-xs">Max</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-xs">%</th>
                <th className="px-3 py-2 text-center font-bold uppercase text-xs">Grade</th>
                <th className="px-3 py-2 text-left font-bold uppercase text-xs">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {studentResults.map((r, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#f0f9f9' : 'white' }}>
                  <td className="px-3 py-2 font-medium uppercase text-xs text-slate-700">{r.subject}</td>
                  <td className="px-3 py-2 text-center text-slate-700">{r.score ?? '—'}</td>
                  <td className="px-3 py-2 text-center text-slate-500">{r.maxScore}</td>
                  <td className="px-3 py-2 text-center text-slate-700">{r.pct ?? '—'}</td>
                  <td className="px-3 py-2 text-center font-bold" style={{ color: r.grade.startsWith('D') ? '#059669' : r.grade.startsWith('F') ? '#dc2626' : '#1a5f5f' }}>
                    {r.grade}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.remarks || r.remark}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ backgroundColor: '#1a5f5f', color: 'white' }}>
                <td className="px-3 py-2 font-bold uppercase text-xs">Overall</td>
                <td className="px-3 py-2 text-center font-bold">{totalScore}</td>
                <td className="px-3 py-2 text-center">{totalMax}</td>
                <td className="px-3 py-2 text-center font-bold">{overallPct}%</td>
                <td className="px-3 py-2 text-center font-bold">{overallGrade}</td>
                <td className="px-3 py-2 text-xs">{getRemark(overallGrade)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comments */}
        <div className="px-6 py-3 border-t" style={{ borderColor: '#7ecece' }}>
          <div className="h-2 mb-3 rounded" style={{ backgroundColor: '#7ecece' }} />
          <div className="space-y-2">
            {[
              { label: 'Teacher Comments:', value: '' },
              { label: 'Excellent In:', value: studentResults.filter(r => r.grade.startsWith('D')).map(r => r.subject).join(', ') },
              { label: 'Can Improve In:', value: studentResults.filter(r => r.grade === 'F9').map(r => r.subject).join(', ') },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase text-slate-700 w-36 shrink-0">{label}</span>
                <div className="flex-1 border-b border-slate-300 min-h-5 text-sm text-slate-600 pb-0.5">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Behavior + Grading System */}
        <div className="px-6 py-3">
          <div className="h-2 mb-3 rounded" style={{ backgroundColor: '#7ecece' }} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="px-3 py-1.5 font-bold text-xs uppercase text-white mb-2" style={{ backgroundColor: '#1a5f5f' }}>Behavior</div>
              {['Diligent', 'Responsible', 'Respectful', 'Resourceful', 'Attentive'].map(b => (
                <div key={b} className="flex items-center gap-2 py-1 border-b border-slate-100">
                  <div className="w-8 border-b border-slate-400 text-center text-xs">✓</div>
                  <span className="text-xs uppercase text-slate-600">{b}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="px-3 py-1.5 font-bold text-xs uppercase text-white mb-2" style={{ backgroundColor: '#1a5f5f' }}>Grading System</div>
              {[
                { g: 'D1–D2', l: 'Distinction (85–100%)' },
                { g: 'C3–C6', l: 'Credit (65–84%)' },
                { g: 'P7–P8', l: 'Pass (50–64%)' },
                { g: 'F9', l: 'Fail (0–49%)' },
              ].map(({ g, l }) => (
                <div key={g} className="py-1 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-700">{g}: </span>
                  <span className="text-xs text-slate-600">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-8 mt-2" style={{ backgroundColor: '#7ecece' }} />
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-card-print, #report-card-print * { visibility: visible; }
          #report-card-print { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
