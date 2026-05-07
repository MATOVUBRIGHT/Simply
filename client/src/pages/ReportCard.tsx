import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Settings, Check, Building, Palette, Layout, FileText as FileTextIcon, Eye, X, GraduationCap, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useStudents } from '../contexts/StudentsContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useToast } from '../contexts/ToastContext';
import LiveEditable from '../components/LiveEditable';

// ΓöÇΓöÇ Grade helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ΓöÇΓöÇ Template ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const TEMPLATE_KEY = 'schofy_report_template';

interface ReportTemplate {
  type: 'modern' | 'classic' | 'high-school';
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
  // Dynamic Labels & Names
  reportTitle: string;
  reportSubTitle: string;
  parentSignatureLabel: string;
  parentSignatureName: string;
  teacherSignatureName: string;
  principalSignatureName: string;
  // Classic template specific
  overallPerformanceTemplate: string;
  strengthsTemplate: string;
  improvementsTemplate: string;
  // Grading
  gradingScale: { grade: string; min: number; max: number; remark: string }[];
  // Behavior items
  behaviorItems: string[];
}

const DEFAULT_TEMPLATE: ReportTemplate = {
  type: 'modern',
  schoolName: '',
  schoolAddress: '',
  schoolPhone: '',
  schoolEmail: '',
  schoolMotto: '',
  schoolLogo: 'S',
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
  reportTitle: 'REPORT CARD',
  reportSubTitle: 'Quality Education for All',
  parentSignatureLabel: "Parent's Signature:",
  parentSignatureName: 'Parent Name',
  teacherSignatureName: 'Teacher Name',
  principalSignatureName: 'Principal Name',
  overallPerformanceTemplate: "has shown consistent improvement throughout the year.",
  strengthsTemplate: "Strong in Mathematics and Physical Education.",
  improvementsTemplate: "Could focus on History for better results.",
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
  const [isLiveEditing, setIsLiveEditing] = useState(false);
  const [editorTab, setEditorTab] = useState<'school' | 'design' | 'sections' | 'grading'>('school');
  const [template, setTemplate] = useState<ReportTemplate>(loadTemplate);
  const [draft, setDraft] = useState<ReportTemplate>(loadTemplate);
  const [saving, setSaving] = useState(false);

  // Undo/Redo History
  const [history, setHistory] = useState<ReportTemplate[]>([]);
  const [redoStack, setRedoStack] = useState<ReportTemplate[]>([]);

  const addToHistory = (t: ReportTemplate) => {
    setHistory(prev => {
      const next = [...prev, t];
      if (next.length > 50) return next.slice(1); // Limit history
      return next;
    });
    setRedoStack([]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(stack => [template, ...stack]);
    setHistory(h => h.slice(0, -1));
    setTemplate(prev);
    saveTemplateLocal(prev);
    addToast('Undo successful', 'info');
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory(h => [...h, template]);
    setRedoStack(stack => stack.slice(1));
    setTemplate(next);
    saveTemplateLocal(next);
    addToast('Redo successful', 'info');
  };

  const { data: exams } = useTableData(sid, 'exams');
  const { data: examResults } = useTableData(sid, 'examResults');
  const { data: subjects } = useTableData(sid, 'subjects');
  const { data: classes } = useTableData(sid, 'classes');
  const { data: settings } = useTableData(sid, 'settings');
  const { students: allStudents } = useStudents();

  const student = allStudents.find(s => s.id === studentId);
  const exam = useMemo(() => {
    if (examId) return exams.find((e: any) => e.id === examId);
    // Fallback to latest exam for this student's class
    return [...exams]
      .filter((e: any) => e.classId === student?.classId || !e.classId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [exams, examId, student?.classId]);

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

  const getGradeFromScale = (pct: number) => {
    const scale = [...template.gradingScale].sort((a, b) => b.min - a.min);
    const found = scale.find(s => pct >= s.min);
    return found ? found.grade : (scale[scale.length - 1]?.grade || 'F9');
  };

  const getRemarkFromScale = (grade: string) => {
    const found = template.gradingScale.find(s => s.grade === grade);
    return found ? found.remark : 'Fail';
  };

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
      const score = (result && result.score !== null && result.score !== undefined) ? Number(result.score) : null;
      const maxScore = result ? Number(result.maxScore || 100) : 100;
      const pct = (score !== null && !isNaN(score) && maxScore > 0) ? Math.round((score / maxScore) * 100) : null;
      const grade = pct !== null ? getGradeFromScale(pct) : '-';
      rows.push({ subject: (sub as any).name, code: (sub as any).code || '', score, maxScore, pct, grade, remark: pct !== null ? getRemarkFromScale(grade) : '-', remarks: result?.remarks || '' });
      if (result) usedKeys.add((sub as any).id);
    }

    for (const [key, result] of resultMap) {
      if (usedKeys.has(key)) continue;
      const sub = subjects.find((s: any) => s.id === key) as any;
      const subjectName = sub?.name || result.subjectName || key;
      const score = (result.score !== null && result.score !== undefined) ? Number(result.score) : 0;
      const maxScore = Number(result.maxScore || 100);
      const pct = (maxScore > 0) ? Math.round((score / maxScore) * 100) : 0;
      const grade = getGradeFromScale(pct);
      rows.push({ subject: subjectName, code: sub?.code || '', score, maxScore, pct, grade, remark: getRemarkFromScale(grade), remarks: result.remarks || '' });
    }

    return rows;
  }, [classSubjects, examResults, examId, studentId, exam, exams, subjects, template.gradingScale]);

  // Yearly results for Classic Template (Quarters)
  const yearlyResults = useMemo(() => {
    if (!studentId || !exam?.year) return [];
    const targetYear = exam.year;

    // Create an exam map for faster lookup
    const examMap = new Map<string, any>();
    exams.forEach((e: any) => examMap.set(e.id, e));

    const relevantResults = examResults.filter((r: any) => {
      if (r.studentId !== studentId) return false;
      const re = examMap.get(r.examId);
      return re && String(re.year) === String(targetYear);
    });

    const resultMap = new Map<string, Record<string, any>>();
    for (const r of relevantResults) {
      const re = examMap.get(r.examId);
      if (!re) continue;
      const term = String(re.term);
      const subjectKey = r.subjectId || r.subjectName || r.id;
      if (!resultMap.has(subjectKey)) resultMap.set(subjectKey, {});
      const subjectResults = resultMap.get(subjectKey)!;
      if (!subjectResults[term] || Number(r.score) > Number(subjectResults[term].score)) {
        subjectResults[term] = r;
      }
    }

    const rows: any[] = [];
    const subjectsToProcess = new Set<string>();
    classSubjects.forEach((s: any) => subjectsToProcess.add(s.id));
    resultMap.forEach((_, key) => subjectsToProcess.add(key));

    for (const key of subjectsToProcess) {
      const sub = subjects.find((s: any) => s.id === key) as any;
      const termResults = resultMap.get(key) || {};
      const subjectName = sub?.name || (Object.values(termResults)[0] as any)?.subjectName || key;
      
      const getTermGrade = (t: string) => {
        const r = termResults[t];
        if (!r || r.score === null || r.score === undefined) return null;
        const score = Number(r.score);
        const maxScore = Number(r.maxScore || 100);
        if (isNaN(score) || isNaN(maxScore) || maxScore === 0) return null;
        const pct = Math.round((score / maxScore) * 100);
        return getGradeFromScale(pct);
      };

      const q1 = getTermGrade('1');
      const q2 = getTermGrade('2');
      const q3 = getTermGrade('3');
      const q4 = getTermGrade('4');

      const grades = [q1, q2, q3, q4].filter(g => g !== null);
      const lastGrade = grades.length > 0 ? grades[grades.length - 1] : '-';
      const remark = lastGrade === '-' ? '-' : getRemarkFromScale(lastGrade!);

      rows.push({ subject: subjectName, q1, q2, q3, q4, remark });
    }
    return rows;
  }, [studentId, exam, exams, examResults, subjects, classSubjects, template.gradingScale]);

  // Semester results for High School Template
  const semesterResults = useMemo(() => {
    if (!studentId || !exam?.year) return [];
    const targetYear = exam.year;

    const examMap = new Map<string, any>();
    exams.forEach((e: any) => examMap.set(e.id, e));

    const relevantResults = examResults.filter((r: any) => {
      if (r.studentId !== studentId) return false;
      const re = examMap.get(r.examId);
      return re && String(re.year) === String(targetYear);
    });

    const resultMap = new Map<string, Record<string, any>>();
    for (const r of relevantResults) {
      const re = examMap.get(r.examId);
      if (!re) continue;
      const term = String(re.term);
      const subjectKey = r.subjectId || r.subjectName || r.id;
      if (!resultMap.has(subjectKey)) resultMap.set(subjectKey, {});
      const subjectResults = resultMap.get(subjectKey)!;
      if (!subjectResults[term] || Number(r.score) > Number(subjectResults[term].score)) {
        subjectResults[term] = r;
      }
    }

    const rows: any[] = [];
    const subjectsToProcess = new Set<string>();
    classSubjects.forEach((s: any) => subjectsToProcess.add(s.id));
    resultMap.forEach((_, key) => subjectsToProcess.add(key));

    for (const key of subjectsToProcess) {
      const sub = subjects.find((s: any) => s.id === key) as any;
      const termResults = resultMap.get(key) || {};
      const subjectName = sub?.name || (Object.values(termResults)[0] as any)?.subjectName || key;
      
      const getTermGrade = (t: string) => {
        const r = termResults[t];
        if (!r || r.score === null || r.score === undefined) return null;
        const score = Number(r.score);
        const maxScore = Number(r.maxScore || 100);
        if (isNaN(score) || isNaN(maxScore) || maxScore === 0) return null;
        const pct = Math.round((score / maxScore) * 100);
        return getGradeFromScale(pct);
      };

      const s1 = getTermGrade('1');
      const s2 = getTermGrade('2');
      
      const getFinalGrade = () => {
        const results = Object.values(termResults);
        if (results.length === 0) return '-';
        const totalScore = results.reduce((sum, r) => sum + (Number(r.score) || 0), 0);
        const totalMax = results.reduce((sum, r) => sum + (Number(r.maxScore) || 100), 0);
        const pct = Math.round((totalScore / totalMax) * 100);
        return getGradeFromScale(pct);
      };

      const finalGrade = getFinalGrade();
      rows.push({ subject: subjectName, s1, s2, finalGrade });
    }
    return rows;
  }, [studentId, exam, exams, examResults, subjects, classSubjects, template.gradingScale]);

  const totalScore = studentResults.reduce((s, r) => s + (r.score ?? 0), 0);
  const totalMax = studentResults.reduce((s, r) => s + r.maxScore, 0);
  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const overallGrade = getGradeFromScale(overallPct);
  const overallRemark = getRemarkFromScale(overallGrade);

  // Calculate position in class -- rank all class students by total score for same term/year
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
    const dataToSave = showEditor ? draft : template;
    try {
      saveTemplateLocal(dataToSave);
      setTemplate({ ...dataToSave });
      if (applyAll) {
        await dataService.saveSettings(sid, { reportTemplate: JSON.stringify(dataToSave) });
        addToast('Template applied to all classes and devices', 'success');
      } else {
        addToast('Template saved', 'success');
      }
      setShowEditor(false);
      setIsLiveEditing(false);
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

  const updateTemplate = (updates: Partial<ReportTemplate>) => {
    addToHistory(template);
    const newTemplate = { ...template, ...updates };
    setTemplate(newTemplate);
    saveTemplateLocal(newTemplate);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 print:hidden flex-wrap">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white flex-1">Report Card</h1>
        
        <button 
          onClick={() => setIsLiveEditing(!isLiveEditing)} 
          className={`btn flex items-center gap-2 ${isLiveEditing ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'btn-secondary'}`}
          title="Edit text directly on the report card"
        >
          {isLiveEditing ? <Check size={16} /> : <Palette size={16} />} 
          {isLiveEditing ? 'Finish Editing' : 'Live Edit'}
        </button>

        {isLiveEditing && (
          <div className="flex items-center gap-1 border-l dark:border-slate-700 pl-2 ml-1">
            <button 
              onClick={undo} 
              disabled={history.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
              title="Undo"
            >
              <RefreshCw size={16} className="rotate-[-90deg]" />
            </button>
            <button 
              onClick={redo} 
              disabled={redoStack.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
              title="Redo"
            >
              <RefreshCw size={16} className="scale-x-[-1] rotate-[-90deg]" />
            </button>
            
            <button 
              onClick={() => handleSave(true)} 
              className="btn btn-primary flex items-center gap-2 ml-2"
              disabled={saving}
            >
              <Settings size={16} /> {saving ? 'Saving...' : 'Apply to All'}
            </button>
          </div>
        )}

        <button onClick={openEditor} className="btn btn-secondary flex items-center gap-2">
          <Settings size={16} /> Full Settings
        </button>
        <button onClick={() => window.print()} className="btn btn-primary flex items-center gap-2">
          <Download size={16} /> Export PDF
        </button>
      </div>

      {/* ΓöÇΓöÇ Report Card ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <div id="report-card-print" className="bg-white mx-auto max-w-2xl shadow-xl print:shadow-none print:max-w-full overflow-hidden" style={{ fontFamily: 'Arial, sans-serif' }}>
        {template.type === 'modern' ? (
          <>
            {/* Modern Template Header */}
            <div className="p-5" style={{ backgroundColor: hdr }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h1 className="text-2xl font-black text-white uppercase tracking-wide">
                    <LiveEditable 
                      value={displaySchoolName} 
                      onSave={v => updateTemplate({ schoolName: v })} 
                      isLiveEditing={isLiveEditing} 
                    />
                  </h1>
                  {(template.schoolMotto || isLiveEditing) && (
                    <p className="text-sm italic mt-0.5" style={{ color: acc }}>
                      "<LiveEditable 
                        value={template.schoolMotto || 'School Motto'} 
                        onSave={v => updateTemplate({ schoolMotto: v })} 
                        isLiveEditing={isLiveEditing} 
                      />"
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs" style={{ color: `${acc}cc` }}>
                    <span>Addr: <LiveEditable value={displayAddress || 'Address'} onSave={v => updateTemplate({ schoolAddress: v })} isLiveEditing={isLiveEditing} /></span>
                    <span>Tel: <LiveEditable value={displayPhone || 'Phone'} onSave={v => updateTemplate({ schoolPhone: v })} isLiveEditing={isLiveEditing} /></span>
                    <span>Mail: <LiveEditable value={displayEmail || 'Email'} onSave={v => updateTemplate({ schoolEmail: v })} isLiveEditing={isLiveEditing} /></span>
                  </div>
                  <h2 className="text-lg font-bold mt-2" style={{ color: acc }}>
                    <LiveEditable 
                      value={template.reportTitle || 'STUDENT REPORT CARD'} 
                      onSave={v => updateTemplate({ reportTitle: v })} 
                      isLiveEditing={isLiveEditing} 
                    />
                  </h2>
                </div>
                <div className="w-16 h-16 rounded-xl bg-white shadow-lg flex items-center justify-center overflow-hidden shrink-0">
                  {template.schoolLogo && (template.schoolLogo.startsWith('http') || template.schoolLogo.startsWith('data:')) ? (
                    <img src={template.schoolLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-3xl font-black text-indigo-600">
                      <LiveEditable 
                        value={template.schoolLogo || 'S'} 
                        onSave={v => updateTemplate({ schoolLogo: v })} 
                        isLiveEditing={isLiveEditing} 
                      />
                    </span>
                  )}
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
                  { label: 'Exam:', value: exam?.name || '-' },
                  { label: 'Term:', value: `Term ${exam?.term} - ${exam?.year}` },
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
              <div className="overflow-x-auto">
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
                        <td className="px-2 py-1.5 text-center text-slate-700">{r.score ?? '-'}</td>
                        <td className="px-2 py-1.5 text-center text-slate-500">{r.maxScore}</td>
                        <td className="px-2 py-1.5 text-center text-slate-700">{r.pct ?? '-'}</td>
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
                      <td className="px-2 py-1.5">{overallRemark}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
                          <div className="w-6 border-b border-slate-400 text-center text-[10px]">v</div>
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
                          <span className="text-[10px] font-bold text-slate-700">{grade} ({min}-{max}%): </span>
                          <span className="text-[10px] text-slate-600">{remark}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : template.type === 'high-school' ? (
          <>
            {/* High School Template */}
            <div className="text-slate-900">
              {/* Header with Dark Red Bar */}
              <div className="flex items-stretch mb-8 min-h-[80px]">
                <div className="flex-1 bg-[#7c2222] text-white flex items-center px-8">
                  <h1 className="text-3xl font-serif font-bold italic tracking-wide">
                    <LiveEditable 
                      value={template.reportTitle || 'High School Report Card'} 
                      onSave={v => updateTemplate({ reportTitle: v })} 
                      isLiveEditing={isLiveEditing} 
                    />
                  </h1>
                </div>
                <div className="w-1/3 bg-[#2d3748] text-white p-4 flex items-center justify-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-lg">
                    <GraduationCap size={24} className="text-white" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-sm font-bold leading-tight">
                      <LiveEditable value={displaySchoolName} onSave={v => updateTemplate({ schoolName: v })} isLiveEditing={isLiveEditing} />
                    </h2>
                    <p className="text-[10px] text-slate-300 uppercase tracking-widest">
                      <LiveEditable 
                        value={template.reportSubTitle || 'H i g h   S c h o o l'} 
                        onSave={v => updateTemplate({ reportSubTitle: v })} 
                        isLiveEditing={isLiveEditing} 
                      />
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-10 space-y-8">
                {/* ... existing section ... */}
                <section>
                  <h3 className="text-lg font-serif font-bold text-[#2d3748] border-b-2 border-slate-200 pb-1 mb-4">Student Information:</h3>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <label className="text-xs font-bold block mb-1">Name:</label>
                      <div className="border border-slate-300 rounded px-3 py-1.5 text-sm bg-slate-50 min-h-[38px] flex items-center">{student.firstName} {student.lastName}</div>
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1">Grade:</label>
                      <div className="border border-slate-300 rounded px-3 py-1.5 text-sm bg-slate-50 min-h-[38px] flex items-center">{className}</div>
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1">School Year:</label>
                      <div className="border border-slate-300 rounded px-3 py-1.5 text-sm bg-slate-50 min-h-[38px] flex items-center">{academicYear}-{Number(academicYear)+1}</div>
                    </div>
                  </div>
                </section>

                {/* Table Section */}
                <section>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-slate-300 text-sm">
                      <thead>
                        <tr className="bg-[#7c2222] text-white">
                          <th className="border border-slate-300 px-4 py-2 text-left font-bold">Subject</th>
                          <th className="border border-slate-300 px-4 py-2 text-center font-bold">1st Semester</th>
                          <th className="border border-slate-300 px-4 py-2 text-center font-bold">2nd Semester</th>
                          <th className="border border-slate-300 px-4 py-2 text-center font-bold">Final Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {semesterResults.map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="border border-slate-300 px-4 py-2 font-medium">{r.subject}</td>
                            <td className="border border-slate-300 px-4 py-2 text-center">{r.s1 || '-'}</td>
                            <td className="border border-slate-300 px-4 py-2 text-center">{r.s2 || '-'}</td>
                            <td className="border border-slate-300 px-4 py-2 text-center font-bold">{r.finalGrade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Grading & Attendance Grid */}
                <div className="grid grid-cols-2 gap-10">
                  <section>
                    <h3 className="text-md font-bold text-[#2d3748] mb-3">Grading Scale:</h3>
                    <ul className="space-y-1 text-xs">
                      {template.gradingScale.slice(0, 5).map(s => (
                        <li key={s.grade} className="flex gap-2">
                          <span className="font-bold w-4">• {s.grade}:</span>
                          <span>{s.min}-{s.max}%</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3 className="text-md font-bold text-[#2d3748] mb-3">Attendance:</h3>
                    <ul className="space-y-1 text-xs">
                      <li className="flex gap-2">
                        <span className="font-bold">• Days Present:</span>
                        <span>170</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold">• Days Absent:</span>
                        <span>10</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold">• Tardies:</span>
                        <span>3</span>
                      </li>
                    </ul>
                  </section>
                </div>

                {/* Comments Section */}
                <section>
                  <h3 className="text-md font-bold text-[#2d3748] mb-2">Comments:</h3>
                  <div className="border border-slate-300 p-4 rounded text-xs leading-relaxed min-h-[100px] bg-slate-50">
                    <span className="font-bold">{student.firstName}</span> <LiveEditable value={template.overallPerformanceTemplate} onSave={v => updateTemplate({ overallPerformanceTemplate: v })} isLiveEditing={isLiveEditing} />
                  </div>
                </section>

                {/* Signatures Section */}
                <div className="grid grid-cols-3 gap-10 pt-8 pb-4">
                  <div className="text-center space-y-2">
                    <p className="text-xs font-bold mb-6">
                      <LiveEditable value={template.parentSignatureLabel} onSave={v => updateTemplate({ parentSignatureLabel: v })} isLiveEditing={isLiveEditing} />
                    </p>
                    <div className="h-10 border-b border-slate-400 font-serif italic text-lg">
                      <LiveEditable value={template.parentSignatureName} onSave={v => updateTemplate({ parentSignatureName: v })} isLiveEditing={isLiveEditing} />
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">
                      <LiveEditable value={template.parentSignatureName} onSave={v => updateTemplate({ parentSignatureName: v })} isLiveEditing={isLiveEditing} />
                    </p>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-xs font-bold mb-6">
                      <LiveEditable value={template.classTeacherLabel} onSave={v => updateTemplate({ classTeacherLabel: v })} isLiveEditing={isLiveEditing} />
                    </p>
                    <div className="h-10 border-b border-slate-400 font-serif italic text-lg">
                      <LiveEditable value={template.teacherSignatureName} onSave={v => updateTemplate({ teacherSignatureName: v })} isLiveEditing={isLiveEditing} />
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">
                      <LiveEditable value={template.teacherSignatureName} onSave={v => updateTemplate({ teacherSignatureName: v })} isLiveEditing={isLiveEditing} />
                    </p>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-xs font-bold mb-6">
                      <LiveEditable value={template.principalSignatureLabel} onSave={v => updateTemplate({ principalSignatureLabel: v })} isLiveEditing={isLiveEditing} />
                    </p>
                    <div className="h-10 border-b border-slate-400 font-serif italic text-lg">
                      <LiveEditable value={template.principalSignatureName} onSave={v => updateTemplate({ principalSignatureName: v })} isLiveEditing={isLiveEditing} />
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">
                      <LiveEditable value={template.principalSignatureName} onSave={v => updateTemplate({ principalSignatureName: v })} isLiveEditing={isLiveEditing} />
                    </p>
                  </div>
                </div>

                {/* Footer with Icons */}
                <div className="flex justify-between items-center pt-6 border-t border-slate-200 text-[10px] font-bold text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#2d3748] text-white flex items-center justify-center"><Building size={12} /></div>
                    <span><LiveEditable value={displayAddress || 'Address'} onSave={v => updateTemplate({ schoolAddress: v })} isLiveEditing={isLiveEditing} /></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#2d3748] text-white flex items-center justify-center"><Download size={12} /></div>
                    <span><LiveEditable value={displayPhone || 'Phone'} onSave={v => updateTemplate({ schoolPhone: v })} isLiveEditing={isLiveEditing} /></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#2d3748] text-white flex items-center justify-center"><Check size={12} /></div>
                    <span><LiveEditable value={displayEmail || 'Email'} onSave={v => updateTemplate({ schoolEmail: v })} isLiveEditing={isLiveEditing} /></span>
                  </div>
                </div>
              </div>
              <div className="h-8 bg-[#2d3748] mt-8" />
            </div>
          </>
        ) : (
          <>
            {/* Classic Template (Silvers) */}
            <div className="p-8 text-[#1e3a5f]">
              {/* Logo & Header */}
              <div className="flex flex-col items-center text-center space-y-1 mb-6">
                <div className="w-20 h-20 rounded-full border-2 border-[#1e3a5f] p-1 mb-2 overflow-hidden flex items-center justify-center">
                  {template.schoolLogo && (template.schoolLogo.startsWith('http') || template.schoolLogo.startsWith('data:')) ? (
                    <img src={template.schoolLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-4xl font-black text-indigo-600">
                      <LiveEditable value={template.schoolLogo || 'S'} onSave={v => updateTemplate({ schoolLogo: v })} isLiveEditing={isLiveEditing} />
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-black uppercase tracking-wider">
                  <LiveEditable value={displaySchoolName} onSave={v => updateTemplate({ schoolName: v })} isLiveEditing={isLiveEditing} />
                </h1>
                <p className="text-[11px] font-medium">
                  <LiveEditable value={displayAddress || 'Address'} onSave={v => updateTemplate({ schoolAddress: v })} isLiveEditing={isLiveEditing} />
                </p>
                <p className="text-[10px] font-bold">
                  <LiveEditable value={displayEmail || 'Email'} onSave={v => updateTemplate({ schoolEmail: v })} isLiveEditing={isLiveEditing} /> | <LiveEditable value={displayPhone || 'Phone'} onSave={v => updateTemplate({ schoolPhone: v })} isLiveEditing={isLiveEditing} />
                </p>
              </div>

              {/* Report Card Title */}
              <div className="relative mb-8">
                <h2 className="text-4xl font-black text-center tracking-[0.2em] text-[#1e3a5f] uppercase py-2 border-y-4 border-[#1e3a5f]">
                  <LiveEditable value={template.reportTitle || 'REPORT CARD'} onSave={v => updateTemplate({ reportTitle: v })} isLiveEditing={isLiveEditing} />
                </h2>
              </div>

              {/* Student Details Grid */}
              <div className="grid grid-cols-2 gap-x-12 gap-y-4 mb-8">
                {[
                  { label: 'ID Number:', value: student.studentId || student.admissionNo },
                  { label: 'Name:', value: `${student.firstName} ${student.lastName}` },
                  { label: 'Age:', value: student.dob ? (new Date().getFullYear() - new Date(student.dob).getFullYear()) : 'N/A' },
                  { label: 'Gender:', value: student.gender || 'N/A' },
                  { label: 'School Year:', value: `${academicYear}-${Number(academicYear)+1}` },
                  { label: 'Grade & Section:', value: className },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-end gap-2">
                    <span className="text-xs font-black uppercase w-32 shrink-0">{label}</span>
                    <span className="flex-1 border-b-2 border-[#1e3a5f] pb-0.5 text-sm font-bold text-center px-2">{value}</span>
                  </div>
                ))}
              </div>

              {/* Message */}
              <div className="mb-8 space-y-4">
                <p className="text-sm font-bold">Dear Parents,</p>
                <p className="text-xs leading-relaxed font-bold indent-12">
                  This report card shows the ability and progress your child has made in the different learning areas as well as his/her core values.
                </p>
              </div>

              {/* Principal/Adviser Signatures */}
              <div className="grid grid-cols-2 gap-20 mb-10 pt-4">
                <div className="text-center">
                  <div className="border-b-2 border-slate-300 mb-2 h-8" />
                  <span className="text-sm font-black italic">
                    <LiveEditable value={template.principalSignatureLabel} onSave={v => updateTemplate({ principalSignatureLabel: v })} isLiveEditing={isLiveEditing} />
                  </span>
                </div>
                <div className="text-center">
                  <div className="border-b-2 border-slate-300 mb-2 h-8" />
                  <span className="text-sm font-black italic">
                    <LiveEditable value={template.classTeacherLabel} onSave={v => updateTemplate({ classTeacherLabel: v })} isLiveEditing={isLiveEditing} />
                  </span>
                </div>
              </div>

              {/* Classic Table */}
              <div className="mb-8 overflow-x-auto">
                <table className="w-full text-xs border-2 border-[#1e3a5f]">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      <th className="border border-white/20 px-3 py-2 text-left font-black uppercase">Subject</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">1st Qtr</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">2nd Qtr</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">3rd Qtr</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">4th Qtr</th>
                      <th className="border border-white/20 px-3 py-2 text-center font-black uppercase">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearlyResults.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="border border-[#1e3a5f]/30 px-3 py-2 font-bold">{r.subject}</td>
                        <td className="border border-[#1e3a5f]/30 px-2 py-2 text-center font-medium">{r.q1 || '-'}</td>
                        <td className="border border-[#1e3a5f]/30 px-2 py-2 text-center font-medium">{r.q2 || '-'}</td>
                        <td className="border border-[#1e3a5f]/30 px-2 py-2 text-center font-medium">{r.q3 || '-'}</td>
                        <td className="border border-[#1e3a5f]/30 px-2 py-2 text-center font-medium">{r.q4 || '-'}</td>
                        <td className="border border-[#1e3a5f]/30 px-3 py-2 text-center font-bold">{r.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Grading Reference */}
              <div className="grid grid-cols-3 gap-8 mb-10 pt-4 border-t-2 border-[#1e3a5f]">
                <div>
                  <p className="text-[10px] font-black uppercase mb-2">Description</p>
                  <div className="space-y-1 text-[10px] font-bold">
                    <p>Excellent</p>
                    <p>Good</p>
                    <p>Satisfactory</p>
                    <p>Below Average</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase mb-2">Grading Scale</p>
                  <div className="space-y-1 text-[10px] font-bold">
                    <p>(A) 90-100</p>
                    <p>(B) 80-89</p>
                    <p>(C) 70-79</p>
                    <p>(D) 60-69</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase mb-2">Remarks</p>
                  <div className="space-y-1 text-[10px] font-bold">
                    <p>Passed</p>
                    <p>Passed</p>
                    <p>Passed</p>
                    <p>Failed</p>
                  </div>
                </div>
              </div>

              {/* Performance Summary */}
              <div className="space-y-4 pt-4 border-t-2 border-[#1e3a5f]">
                <div className="flex gap-4">
                  <p className="text-xs font-black uppercase w-48 shrink-0">Overall Performance:</p>
                  <p className="text-xs font-bold leading-relaxed">
                    <span className="border-b border-[#1e3a5f] px-4 font-black">{student.firstName} {student.lastName}</span> {template.overallPerformanceTemplate}
                  </p>
                </div>
                <div className="flex gap-4">
                  <p className="text-xs font-black uppercase w-48 shrink-0">Strengths:</p>
                  <p className="text-xs font-bold leading-relaxed border-b border-slate-300 flex-1 min-h-[1.5rem]">
                    {template.strengthsTemplate}
                  </p>
                </div>
                <div className="flex gap-4">
                  <p className="text-xs font-black uppercase w-48 shrink-0">Areas for Improvement:</p>
                  <p className="text-xs font-bold leading-relaxed border-b border-slate-300 flex-1 min-h-[1.5rem]">
                    {template.improvementsTemplate}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {template.footerText && (
          <div className="px-5 py-2 text-center text-[10px] text-slate-500 italic">{template.footerText}</div>
        )}
        <div className="h-6 mt-1" style={{ backgroundColor: acc }} />
      </div>

      {/* ΓöÇΓöÇ Template Editor Modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      {showEditor && createPortal(
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

              {/* ΓöÇΓöÇ School Info ΓöÇΓöÇ */}
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
                      <input value={draft.schoolLogo} onChange={e => setDraft(p => ({ ...p, schoolLogo: e.target.value }))} className="form-input" placeholder="S or https://..." />
                    </div>
                  </div>
                </>
              )}

              {/* ΓöÇΓöÇ Design ΓöÇΓöÇ */}
              {editorTab === 'design' && (
                <>
                  <div>
                    <label className="form-label">Template Style</label>
                    <div className="grid grid-cols-2 gap-3 mt-1.5">
                      <button 
                        onClick={() => setDraft(p => ({ ...p, type: 'modern' }))}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${draft.type === 'modern' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-100 dark:border-slate-700 hover:border-slate-200'}`}
                      >
                        <Layout size={24} className={draft.type === 'modern' ? 'text-primary-600' : 'text-slate-400'} />
                        <span className={`text-xs font-bold ${draft.type === 'modern' ? 'text-primary-700' : 'text-slate-600'}`}>Modern</span>
                      </button>
                      <button 
                        onClick={() => setDraft(p => ({ ...p, type: 'classic' }))}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${draft.type === 'classic' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-100 dark:border-slate-700 hover:border-slate-200'}`}
                      >
                        <FileTextIcon size={24} className={draft.type === 'classic' ? 'text-primary-600' : 'text-slate-400'} />
                        <span className={`text-xs font-bold ${draft.type === 'classic' ? 'text-primary-700' : 'text-slate-600'}`}>Classic (Silvers)</span>
                      </button>
                      <button 
                        onClick={() => setDraft(p => ({ ...p, type: 'high-school' }))}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${draft.type === 'high-school' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-100 dark:border-slate-700 hover:border-slate-200'}`}
                      >
                        <GraduationCap size={24} className={draft.type === 'high-school' ? 'text-primary-600' : 'text-slate-400'} />
                        <span className={`text-xs font-bold ${draft.type === 'high-school' ? 'text-primary-700' : 'text-slate-600'}`}>High School</span>
                      </button>
                    </div>
                  </div>
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

              {/* ΓöÇΓöÇ Sections ΓöÇΓöÇ */}
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

                  <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Labels & Signatures</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label text-xs">Report Title</label>
                        <input value={draft.reportTitle} onChange={e => setDraft(p => ({ ...p, reportTitle: e.target.value }))} className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Report Subtitle</label>
                        <input value={draft.reportSubTitle} onChange={e => setDraft(p => ({ ...p, reportSubTitle: e.target.value }))} className="form-input text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label text-xs">Parent Signature Label</label>
                        <input value={draft.parentSignatureLabel} onChange={e => setDraft(p => ({ ...p, parentSignatureLabel: e.target.value }))} className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Parent Signature Name</label>
                        <input value={draft.parentSignatureName} onChange={e => setDraft(p => ({ ...p, parentSignatureName: e.target.value }))} className="form-input text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label text-xs">Teacher Signature Label</label>
                        <input value={draft.classTeacherLabel} onChange={e => setDraft(p => ({ ...p, classTeacherLabel: e.target.value }))} className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Teacher Signature Name</label>
                        <input value={draft.teacherSignatureName} onChange={e => setDraft(p => ({ ...p, teacherSignatureName: e.target.value }))} className="form-input text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="form-label text-xs">Principal Signature Label</label>
                        <input value={draft.principalSignatureLabel} onChange={e => setDraft(p => ({ ...p, principalSignatureLabel: e.target.value }))} className="form-input text-sm" />
                      </div>
                      <div>
                        <label className="form-label text-xs">Principal Signature Name</label>
                        <input value={draft.principalSignatureName} onChange={e => setDraft(p => ({ ...p, principalSignatureName: e.target.value }))} className="form-input text-sm" />
                      </div>
                    </div>
                  </div>

                  {(draft.type === 'classic' || draft.type === 'high-school') && (
                    <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">Template Messages</h4>
                      <div>
                        <label className="form-label text-xs">Overall Performance Message</label>
                        <input value={draft.overallPerformanceTemplate} onChange={e => setDraft(p => ({ ...p, overallPerformanceTemplate: e.target.value }))} className="form-input text-sm" />
                      </div>
                      {draft.type === 'classic' && (
                        <>
                          <div>
                            <label className="form-label text-xs">Default Strengths</label>
                            <input value={draft.strengthsTemplate} onChange={e => setDraft(p => ({ ...p, strengthsTemplate: e.target.value }))} className="form-input text-sm" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Default Areas for Improvement</label>
                            <input value={draft.improvementsTemplate} onChange={e => setDraft(p => ({ ...p, improvementsTemplate: e.target.value }))} className="form-input text-sm" />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ΓöÇΓöÇ Grading ΓöÇΓöÇ */}
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
      , document.body)}

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
