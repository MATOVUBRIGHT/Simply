import { useMemo, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Settings, Check, Building, Palette, Layout, FileText as FileTextIcon, Eye, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useStudents } from '../contexts/StudentsContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useToast } from '../contexts/ToastContext';

// ── Grade helpers ─────────────────────────────────────────────────────────────
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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ── Template ──────────────────────────────────────────────────────────────────
const TEMPLATE_KEY = 'schofy_report_template';

interface ReportTemplate {
  // School info
  schoolName: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  schoolMotto: string;
  schoolLogo: string; // emoji or URL
  // Colors
  headerColor: string;
  accentColor: string;
  // Sections
  showBehavior: boolean;
  showGradingSystem: boolean;
  showAttendance: boolean;
  showClassTeacher: boolean;
  showNextTerm: boolean;
  // Labels
  teacherCommentLabel: string;
  principalSignatureLabel: string;
  classTeacherLabel: string;
  nextTermLabel: string;
  footerText: string;
  // Grading
  gradingScale: { grade: string; min: number; max: number; remark: string }[];
  // Behavior items
  behaviorItems: string[];
}

const DEFAULT_TEMPLATE: ReportTemplate = {
  schoolName: '',
  schoolAddress: '',
  schoolPhone: '',
  schoolEmail: '',
  schoolMotto: '',
  schoolLogo: '🎓',
  headerColor: '#1a5f5f',
  accentColor: '#7ecece',
  showBehavior: true,
  showGradingSystem: true,
  showAttendance: false,
  showClassTeacher: true,
  showNextTerm: true,
  teacherCommentLabel: "Teacher's Comments:",
  principalSignatureLabel: "Head Teacher's Signature:",
  classTeacherLabel: "Class Teacher's Signature:",
  nextTermLabel: 'Next Term Begins:',
  footerText: '',
  gradingScale: [
    { grade: 'D1', min: 90, max: 100, remark: 'Distinction' },
    { grade: 'D2', min: 85, max: 89, remark: 'Distinction' },
    { grade: 'C3', min: 80, max: 84, remark: 'Credit' },
    { grade: 'C4', min: 75, max: 79, remark: 'Credit' },
    { grade: 'C5', min: 70, max: 74, remark: 'Credit' },
    { grade: 'C6', min: 65, max: 69, remark: 'Credit' },
    { grade: 'P7', min: 60, max: 64, remark: 'Pass' },
    { grade: 'P8', min: 50, max: 59, remark: 'Pass' },
    { grade: 'F9', min: 0, max: 49, remark: 'Fail' },
  ],
  behaviorItems: ['Diligent', 'Responsible', 'Respectful', 'Resourceful', 'Attentive'],
};

function loadTemplate(): ReportTemplate {
  try {
    const saved = localStorage.getItem(TEMPLATE_KEY);
    if (saved) return { ...DEFAULT_TEMPLATE, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_TEMPLATE;
}
function saveTemplateLocal(t: ReportTemplate) {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t));
}

export default function ReportCard() {
  const { id: studentId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get('exam') || '';
  const navigate = useNavigate();
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const sid = schoolId || user?.id || '';

  const [showEditor, setShowEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<'school' | 'design' | 'sections' | 'grading'>('school');
  const [template, setTemplate] = useState<ReportTemplate>(loadTemplate);
  const [draft, setDraft] = useState<ReportTemplate>(loadTemplate);
  const [saving, setSaving] = useState(false);

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

  // School info: template overrides settings
  const displaySchoolName = template.schoolName || settingsMap.schoolName || 'School Name';
  const displayAddress = template.schoolAddress || settingsMap.schoolAddress || '';
  const displayPhone = template.schoolPhone || settingsMap.schoolPhone || '';
  const displayEmail = template.schoolEmail || settingsMap.schoolEmail || '';
  const academicYear = settingsMap.academicYear || new Date().getFullYear().toString();

  const classSubjects = useMemo(() =>
    subjects.filter((s: any) => s.classId === student?.classId),
    [subjects, student]);

  // Collect all results for this student in the same term
  const studentResults = useMemo(() => {
    if (!studentId) return [];
    const targetTerm = exam?.term;
    const targetYear = exam?.year;

    const relevantResults = examResults.filter((r: any) => {
      if (r.studentId !== studentId) return false;
      if (r.examId === examId) return true;
      if (targetTerm && targetYear) {
        const re = exams.find((e: any) => e.id === r.examId) as any;
        return re && String(re.term) === String(targetTerm) && String(re.year) === String(targetYear);
      }
      return false;
    });

    const resultMap = new Map<string, any>();
    for (const r of relevantResults) {
      const key = r.subjectId || r.subjectName || r.id;
      const existing = resultMap.get(key);
      if (!existing || (Number(r.score) ?? 0) > (Number(existing.score) ?? 0)) {
        resultMap.set(key, r);
      }
    }

    const rows: any[] = [];
    const usedKeys = new Set<string>();

    for (const sub of classSubjects) {
      const result = resultMap.get((sub as any).id) as any;
      const score = result ? Number(result.score) : null;
      const maxScore = result ? Number(result.maxScore || 100) : 100;
      const pct = score !== null ? Math.round((score / maxScore) * 100) : null;
      const grade = pct !== null ? getGrade(pct) : '—';
      rows.push({ subject: (sub as any).name, code: (sub as any).code || '', score, maxScore, pct, grade, remark: pct !== null ? getRemark(grade) : '—', remarks: result?.remarks || '' });
      if (result) usedKeys.add((sub as any).id);
    }

    for (const [key, result] of resultMap) {
      if (usedKeys.has(key)) continue;
      const sub = subjects.find((s: any) => s.id === key) as any;
      const subjectName = sub?.name || result.subjectName || key;
      const score = Number(result.score);
      const maxScore = Number(result.maxScore || 100);
      const pct = Math.round((score / maxScore) * 100);
      const grade = getGrade(pct);
      rows.push({ subject: subjectName, code: sub?.code || '', score, maxScore, pct, grade, remark: getRemark(grade), remarks: result.remarks || '' });
    }

    return rows;
  }, [classSubjects, examResults, examId, studentId, exam, exams, subjects]);

  const totalScore = studentResults.reduce((s, r) => s + (r.score ?? 0), 0);
  const totalMax = studentResults.reduce((s, r) => s + r.maxScore, 0);
  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const overallGrade = getGrade(overallPct);

  // Calculate position in class — rank all class students by total score for same term/year
  const classPosition = useMemo(() => {
    if (!studentId || !student?.classId) return null;
    const targetTerm = exam?.term;
    const targetYear = exam?.year;
    if (!targetTerm || !targetYear) return null;

    const classStudents = allStudents.filter(s => s.classId === student.classId && s.status === 'active');
    if (classStudents.length < 2) return null;

    // Sum all scores for each student in this class for the same term/year
    const scores = classStudents.map(s => {
      const results = (examResults as any[]).filter(r => {
        if (r.studentId !== s.id) return false;
        const re = (exams as any[]).find(e => e.id === r.examId);
        return re && String(re.term) === String(targetTerm) && String(re.year) === String(targetYear);
      });
      const total = results.reduce((sum: number, r: any) => sum + (Number(r.score) || 0), 0);
      return { studentId: s.id, total };
    }).sort((a, b) => b.total - a.total);

    const pos = scores.findIndex(s => s.studentId === studentId) + 1;
    return pos > 0 ? { position: pos, outOf: classStudents.length } : null;
  }, [studentId, exam, allStudents, examResults, exams, student]);

  function openEditor() {
    setDraft({ ...template });
    setEditorTab('school');
    setShowEditor(true);
  }

  async function handleSave(applyAll: boolean) {
    setSaving(true);
    try {
      saveTemplateLocal(draft);
      setTemplate({ ...draft });
      if (applyAll) {
        await dataService.saveSettings(sid, { reportTemplate: JSON.stringify(draft) });
        addToast('Template applied to all classes and devices', 'success');
      } else {
        addToast('Template saved', 'success');
      }
      setShowEditor(false);
    } catch {
      addToast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!student) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Student not found.</p>
        <button onClick={() => navigate(-1)} className="btn btn-secondary mt-4">Go Back</button>
      </div>
    );
  }

  const hdr = template.headerColor;
  const acc = template.accentColor;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 print:hidden flex-wrap">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white flex-1">Report Card</h1>
        <button onClick={openEditor} className="btn btn-secondary flex items-center gap-2">
          <Settings size={16} /> Edit Template
        </button>
        <button onClick={() => window.print()} className="btn btn-primary flex items-center gap-2">
          <Download size={16} /> Export PDF
        </button>
      </div>

      {/* ── Report Card ──────────────────────────────────────────────────── */}
      <div id="report-card-print" className="bg-white mx-auto max-w-2xl shadow-xl print:shadow-none print:max-w-full" style={{ fontFamily: 'Arial, sans-serif' }}>

        {/* Header */}
        <div className="p-5" style={{ backgroundColor: hdr }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-black text-white uppercase tracking-wide">{displaySchoolName}</h1>
              {template.schoolMotto && <p className="text-sm italic mt-0.5" style={{ color: acc }}>"{template.schoolMotto}"</p>}
              <div className="flex flex-wrap gap-3 mt-1.5 text-xs" style={{ color: `${acc}cc` }}>
                {displayAddress && <span>📍 {displayAddress}</span>}
                {displayPhone && <span>📞 {displayPhone}</span>}
                {displayEmail && <span>✉ {displayEmail}</span>}
              </div>
              <h2 className="text-lg font-bold mt-2" style={{ color: acc }}>STUDENT REPORT CARD</h2>
            </div>
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-3xl shrink-0">
              {template.schoolLogo}
            </div>
          </div>
        </div>

        {/* Student Info */}
        <div className="px-5 py-3 border-b-2" style={{ borderColor: acc }}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Student Name:', value: `${student.firstName} ${student.lastName}` },
              { label: 'Student ID:', value: student.studentId || student.admissionNo },
              { label: 'Class:', value: className },
              { label: 'Academic Year:', value: academicYear },
              { label: 'Exam:', value: exam?.name || '—' },
              { label: 'Term:', value: `Term ${exam?.term} · ${exam?.year}` },
              ...(classPosition ? [{ label: 'Position:', value: `${classPosition.position}${ordinal(classPosition.position)} out of ${classPosition.outOf}` }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-600 whitespace-nowrap w-28 shrink-0">{label}</span>
                <span className="flex-1 px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${acc}30` }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Marks Table */}
        <div className="px-5 py-3">
          <div className="h-1.5 mb-2 rounded" style={{ backgroundColor: acc }} />
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ backgroundColor: hdr, color: 'white' }}>
                <th className="px-2 py-1.5 text-left font-bold uppercase">Subject</th>
                <th className="px-2 py-1.5 text-center font-bold uppercase">Score</th>
                <th className="px-2 py-1.5 text-center font-bold uppercase">Max</th>
                <th className="px-2 py-1.5 text-center font-bold uppercase">%</th>
                <th className="px-2 py-1.5 text-center font-bold uppercase">Grade</th>
                <th className="px-2 py-1.5 text-left font-bold uppercase">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {studentResults.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400 text-xs">No results recorded for this exam</td></tr>
              ) : studentResults.map((r, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? `${acc}18` : 'white' }}>
                  <td className="px-2 py-1.5 font-medium uppercase text-slate-700">{r.subject}</td>
                  <td className="px-2 py-1.5 text-center text-slate-700">{r.score ?? '—'}</td>
                  <td className="px-2 py-1.5 text-center text-slate-500">{r.maxScore}</td>
                  <td className="px-2 py-1.5 text-center text-slate-700">{r.pct ?? '—'}</td>
                  <td className="px-2 py-1.5 text-center font-bold" style={{ color: r.grade.startsWith('D') ? '#059669' : r.grade.startsWith('F') ? '#dc2626' : hdr }}>
                    {r.grade}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{r.remarks || r.remark}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: hdr, color: 'white' }}>
                <td className="px-2 py-1.5 font-bold uppercase">Overall</td>
                <td className="px-2 py-1.5 text-center font-bold">{totalScore}</td>
                <td className="px-2 py-1.5 text-center">{totalMax}</td>
                <td className="px-2 py-1.5 text-center font-bold">{overallPct}%</td>
                <td className="px-2 py-1.5 text-center font-bold">{overallGrade}</td>
                <td className="px-2 py-1.5">{getRemark(overallGrade)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Comments */}
        <div className="px-5 py-3 border-t" style={{ borderColor: acc }}>
          <div className="h-1.5 mb-2 rounded" style={{ backgroundColor: acc }} />
          <div className="space-y-2.5">
            {[
              { label: template.teacherCommentLabel, value: '' },
              { label: 'Excellent In:', value: studentResults.filter(r => r.grade.startsWith('D')).map(r => r.subject).join(', ') },
              { label: 'Needs Improvement In:', value: studentResults.filter(r => r.grade === 'F9').map(r => r.subject).join(', ') },
              ...(template.showClassTeacher ? [{ label: template.classTeacherLabel, value: '' }] : []),
              { label: template.principalSignatureLabel, value: '' },
              ...(template.showNextTerm ? [{ label: template.nextTermLabel, value: '' }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="flex items-end gap-3">
                <span className="text-[10px] font-bold uppercase text-slate-600 w-40 shrink-0 pb-0.5">{label}</span>
                <div className="flex-1 border-b border-slate-300 min-h-4 text-xs text-slate-600 pb-0.5">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Behavior + Grading */}
        {(template.showBehavior || template.showGradingSystem) && (
          <div className="px-5 py-3">
            <div className="h-1.5 mb-2 rounded" style={{ backgroundColor: acc }} />
            <div className="grid grid-cols-2 gap-4">
              {template.showBehavior && (
                <div>
                  <div className="px-2 py-1 font-bold text-[10px] uppercase text-white mb-1.5" style={{ backgroundColor: hdr }}>Behavior Assessment</div>
                  {template.behaviorItems.map(b => (
                    <div key={b} className="flex items-center gap-2 py-0.5 border-b border-slate-100">
                      <div className="w-6 border-b border-slate-400 text-center text-[10px]">✓</div>
                      <span className="text-[10px] uppercase text-slate-600">{b}</span>
                    </div>
                  ))}
                </div>
              )}
              {template.showGradingSystem && (
                <div>
                  <div className="px-2 py-1 font-bold text-[10px] uppercase text-white mb-1.5" style={{ backgroundColor: hdr }}>Grading System</div>
                  {template.gradingScale.map(({ grade, min, max, remark }) => (
                    <div key={grade} className="py-0.5 border-b border-slate-100">
                      <span className="text-[10px] font-bold text-slate-700">{grade} ({min}–{max}%): </span>
                      <span className="text-[10px] text-slate-600">{remark}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {template.footerText && (
          <div className="px-5 py-2 text-center text-[10px] text-slate-500 italic">{template.footerText}</div>
        )}
        <div className="h-6 mt-1" style={{ backgroundColor: acc }} />
      </div>

      {/* ── Template Editor Modal ─────────────────────────────────────────── */}
      {showEditor && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden" onClick={() => setShowEditor(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Editor header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2"><Settings size={18} className="text-white" /><h3 className="font-bold text-white">Edit Report Template</h3></div>
              <button onClick={() => setShowEditor(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
              {[
                { id: 'school', label: 'School Info', icon: Building },
                { id: 'design', label: 'Design', icon: Palette },
                { id: 'sections', label: 'Sections', icon: Layout },
                { id: 'grading', label: 'Grading', icon: FileTextIcon },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setEditorTab(id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    editorTab === id ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}>
                  <Icon size={14} />{label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">

              {/* ── School Info ── */}
              {editorTab === 'school' && (
                <>
                  <p className="text-xs text-slate-500">These override the school settings for the report card only. Leave blank to use Settings values.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="form-label">School Name</label>
                      <input value={draft.schoolName} onChange={e => setDraft(p => ({ ...p, schoolName: e.target.value }))} className="form-input" placeholder="Leave blank to use Settings" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="form-label">School Address</label>
                      <input value={draft.schoolAddress} onChange={e => setDraft(p => ({ ...p, schoolAddress: e.target.value }))} className="form-input" placeholder="e.g. P.O. Box 123, Kampala" />
                    </div>
                    <div>
                      <label className="form-label">Phone</label>
                      <input value={draft.schoolPhone} onChange={e => setDraft(p => ({ ...p, schoolPhone: e.target.value }))} className="form-input" placeholder="+256 700 000 000" />
                    </div>
                    <div>
                      <label className="form-label">Email</label>
                      <input value={draft.schoolEmail} onChange={e => setDraft(p => ({ ...p, schoolEmail: e.target.value }))} className="form-input" placeholder="school@example.com" />
                    </div>
                    <div>
                      <label className="form-label">School Motto</label>
                      <input value={draft.schoolMotto} onChange={e => setDraft(p => ({ ...p, schoolMotto: e.target.value }))} className="form-input" placeholder="e.g. Excellence in Education" />
                    </div>
                    <div>
                      <label className="form-label">Logo (emoji or URL)</label>
                      <input value={draft.schoolLogo} onChange={e => setDraft(p => ({ ...p, schoolLogo: e.target.value }))} className="form-input" placeholder="🎓 or https://..." />
                    </div>
                  </div>
                </>
              )}

              {/* ── Design ── */}
              {editorTab === 'design' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="form-label">Header Color</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={draft.headerColor} onChange={e => setDraft(p => ({ ...p, headerColor: e.target.value }))} className="w-10 h-9 rounded border border-slate-200 cursor-pointer shrink-0" />
                        <input type="text" value={draft.headerColor} onChange={e => setDraft(p => ({ ...p, headerColor: e.target.value }))} className="form-input flex-1 font-mono text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="form-label">Accent Color</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={draft.accentColor} onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))} className="w-10 h-9 rounded border border-slate-200 cursor-pointer shrink-0" />
                        <input type="text" value={draft.accentColor} onChange={e => setDraft(p => ({ ...p, accentColor: e.target.value }))} className="form-input flex-1 font-mono text-sm" />
                      </div>
                    </div>
                  </div>
                  {/* Color presets */}
                  <div>
                    <label className="form-label">Color Presets</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: 'Teal', hdr: '#1a5f5f', acc: '#7ecece' },
                        { name: 'Navy', hdr: '#1e3a5f', acc: '#7eb8ce' },
                        { name: 'Forest', hdr: '#1a5f2a', acc: '#7ece8a' },
                        { name: 'Maroon', hdr: '#5f1a1a', acc: '#ce7e7e' },
                        { name: 'Purple', hdr: '#3d1a5f', acc: '#b07ece' },
                        { name: 'Slate', hdr: '#2d3748', acc: '#90cdf4' },
                        { name: 'Gold', hdr: '#7c5c00', acc: '#f6d860' },
                        { name: 'Crimson', hdr: '#7c0022', acc: '#f68080' },
                        { name: 'Indigo', hdr: '#312e81', acc: '#a5b4fc' },
                        { name: 'Emerald', hdr: '#064e3b', acc: '#6ee7b7' },
                        { name: 'Rose', hdr: '#881337', acc: '#fda4af' },
                        { name: 'Amber', hdr: '#78350f', acc: '#fcd34d' },
                        { name: 'Cyan', hdr: '#164e63', acc: '#67e8f9' },
                        { name: 'Brown', hdr: '#44200a', acc: '#d4a574' },
                        { name: 'Black', hdr: '#111827', acc: '#9ca3af' },
                      ].map(({ name, hdr: h, acc: a }) => (
                        <button key={name} onClick={() => setDraft(p => ({ ...p, headerColor: h, accentColor: a }))}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:border-slate-400 transition-colors ${draft.headerColor === h ? 'border-slate-500 ring-1 ring-slate-400' : 'border-slate-200'}`}>
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: h }} />
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: a }} />
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Footer Text</label>
                    <input value={draft.footerText} onChange={e => setDraft(p => ({ ...p, footerText: e.target.value }))} className="form-input" placeholder="e.g. This report is computer generated and valid without a stamp" />
                  </div>
                </>
              )}

              {/* ── Sections ── */}
              {editorTab === 'sections' && (
                <>
                  <div className="space-y-3">
                    {[
                      { key: 'showBehavior', label: 'Behavior Assessment section' },
                      { key: 'showGradingSystem', label: 'Grading System reference' },
                      { key: 'showClassTeacher', label: "Class Teacher's signature line" },
                      { key: 'showNextTerm', label: 'Next Term date line' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <input type="checkbox" checked={(draft as any)[key]} onChange={e => setDraft(p => ({ ...p, [key]: e.target.checked }))} className="w-4 h-4 rounded" />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="form-label">Teacher Comment Label</label>
                      <input value={draft.teacherCommentLabel} onChange={e => setDraft(p => ({ ...p, teacherCommentLabel: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Principal Signature Label</label>
                      <input value={draft.principalSignatureLabel} onChange={e => setDraft(p => ({ ...p, principalSignatureLabel: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Class Teacher Label</label>
                      <input value={draft.classTeacherLabel} onChange={e => setDraft(p => ({ ...p, classTeacherLabel: e.target.value }))} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Next Term Label</label>
                      <input value={draft.nextTermLabel} onChange={e => setDraft(p => ({ ...p, nextTermLabel: e.target.value }))} className="form-input" />
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Behavior Items <span className="text-slate-400 font-normal text-xs">(one per line)</span></label>
                    <textarea
                      value={draft.behaviorItems.join('\n')}
                      onChange={e => setDraft(p => ({ ...p, behaviorItems: e.target.value.split('\n').filter(Boolean) }))}
                      className="form-input font-mono text-sm"
                      rows={5}
                    />
                  </div>
                </>
              )}

              {/* ── Grading ── */}
              {editorTab === 'grading' && (
                <>
                  <p className="text-xs text-slate-500">Edit the grading scale shown on the report card.</p>
                  <div className="space-y-2">
                    {draft.gradingScale.map((row, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 items-center">
                        <input value={row.grade} onChange={e => setDraft(p => { const s = [...p.gradingScale]; s[i] = { ...s[i], grade: e.target.value }; return { ...p, gradingScale: s }; })} className="form-input text-sm font-mono" placeholder="Grade" />
                        <input type="number" value={row.min} onChange={e => setDraft(p => { const s = [...p.gradingScale]; s[i] = { ...s[i], min: Number(e.target.value) }; return { ...p, gradingScale: s }; })} className="form-input text-sm" placeholder="Min%" />
                        <input type="number" value={row.max} onChange={e => setDraft(p => { const s = [...p.gradingScale]; s[i] = { ...s[i], max: Number(e.target.value) }; return { ...p, gradingScale: s }; })} className="form-input text-sm" placeholder="Max%" />
                        <input value={row.remark} onChange={e => setDraft(p => { const s = [...p.gradingScale]; s[i] = { ...s[i], remark: e.target.value }; return { ...p, gradingScale: s }; })} className="form-input text-sm" placeholder="Remark" />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setDraft(p => ({ ...p, gradingScale: [...p.gradingScale, { grade: '', min: 0, max: 0, remark: '' }] }))}
                    className="btn btn-secondary text-sm">+ Add Row</button>
                </>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex gap-2 shrink-0 flex-wrap">
              <button onClick={() => setShowEditor(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => handleSave(false)} disabled={saving} className="btn btn-primary flex items-center gap-2 flex-1">
                <Check size={16} /> Save for this device
              </button>
              <button onClick={() => handleSave(true)} disabled={saving} className="btn btn-primary flex items-center gap-2 flex-1" style={{ backgroundColor: '#059669', borderColor: '#059669' }}>
                <Eye size={16} /> {saving ? 'Saving...' : 'Apply to All Classes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { margin: 0; padding: 0; background: white !important; }
          /* Hide everything except the report card */
          body * { visibility: hidden; }
          #report-card-print, #report-card-print * { visibility: visible !important; }
          #report-card-print {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
