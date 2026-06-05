import { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Settings, Check, Building, Palette, Layout, FileText as FileTextIcon, Eye, X, GraduationCap, RefreshCw, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { useStudents } from '../contexts/StudentsContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useToast } from '../contexts/ToastContext';
import LiveEditable from '../components/LiveEditable';
import { openPrintPreview } from '../utils/printPreview';
import { getSubjectDisplayCode, normalizeSubjectCode } from '../utils/subjects';

// ΓöÇΓöÇ Grade helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function normalizeSubjectKey(value: unknown) {
  return normalizeSubjectCode(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getSubjectIdentity(subject: any, fallbackName?: string, fallbackId?: string) {
  const nameKey = normalizeSubjectKey(subject?.name || fallbackName);
  const codeKey = normalizeSubjectKey(getSubjectDisplayCode(subject));
  return nameKey || codeKey || fallbackId || '';
}

// ΓöÇΓöÇ Template ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const TEMPLATE_KEY = 'schofy_report_template';
const REPORT_TEMPLATE_CLASS_PREFIX = 'schofy_report_template_class_';
const REPORT_TEMPLATE_SCHOOL_TYPE_PREFIX = 'schofy_report_template_school_type_';

type TemplateSaveScope = 'device' | 'class' | 'schoolType' | 'all';

type ReportTemplateType =
  | 'modern'
  | 'classic'
  | 'high-school'
  | 'signed'
  | 'nursery'
  | 'primary'
  | 'o-level'
  | 'a-level-new-curriculum'
  | 'secondary-default-subjects';

interface ReportTemplate {
  type: ReportTemplateType;
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
  textColor: string;
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
  // Editable static words/headers on templates. Student records are not stored here.
  textLabels: Record<string, string>;
}

const TEMPLATE_OPTIONS: { type: ReportTemplateType; label: string; icon: typeof Layout }[] = [
  { type: 'modern', label: 'Modern', icon: Layout },
  { type: 'classic', label: 'Classic (Silvers)', icon: FileTextIcon },
  { type: 'high-school', label: 'High School', icon: GraduationCap },
  { type: 'signed', label: 'Head & Class Signatures', icon: Check },
  { type: 'nursery', label: 'Nursery Template Report Card', icon: Palette },
  { type: 'primary', label: 'Primary Template Report Card', icon: Building },
  { type: 'o-level', label: 'Secondary Template Report Card', icon: GraduationCap },
  { type: 'a-level-new-curriculum', label: 'Advanced Curriculum Template Report Card', icon: FileTextIcon },
  { type: 'secondary-default-subjects', label: 'Secondary Default Subjects', icon: Layout },
];

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
  textColor: '#0f172a',
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
  textLabels: {},
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

function parseTemplate(value: unknown): ReportTemplate | null {
  try {
    if (!value) return null;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return { ...DEFAULT_TEMPLATE, ...(parsed as Partial<ReportTemplate>) };
  } catch {
    return null;
  }
}

function classTemplateKey(sid: string, classId: string) {
  return `${REPORT_TEMPLATE_CLASS_PREFIX}${sid}_${classId}`;
}

function schoolTypeTemplateKey(sid: string, schoolType: string) {
  return `${REPORT_TEMPLATE_SCHOOL_TYPE_PREFIX}${sid}_${schoolType || 'default'}`;
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
  const [loadedTemplateScope, setLoadedTemplateScope] = useState('');
  const logoInputRef = useRef<HTMLInputElement>(null);

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

  const classItem = classes.find((c: any) => c.id === student?.classId);
  const className = classItem?.name || '';

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
  const displayLogo = template.schoolLogo && template.schoolLogo !== 'S' ? template.schoolLogo : settingsMap.schoolLogo || template.schoolLogo || 'S';
  const academicYear = settingsMap.academicYear || new Date().getFullYear().toString();
  const schoolType = settingsMap.schoolType || settingsMap.schoolCategory || 'default';

  useEffect(() => {
    if (!sid || !student?.classId) return;
    const scopeKey = `${sid}:${student.classId}:${schoolType}:${settingsMap.reportTemplate || ''}:${settingsMap[`reportTemplateClass_${student.classId}`] || ''}:${settingsMap[`reportTemplateSchoolType_${schoolType}`] || ''}`;
    if (loadedTemplateScope === scopeKey) return;

    const scopedTemplate =
      parseTemplate(settingsMap[`reportTemplateClass_${student.classId}`]) ||
      parseTemplate(localStorage.getItem(classTemplateKey(sid, student.classId))) ||
      parseTemplate(settingsMap[`reportTemplateSchoolType_${schoolType}`]) ||
      parseTemplate(localStorage.getItem(schoolTypeTemplateKey(sid, schoolType))) ||
      parseTemplate(settingsMap.reportTemplate) ||
      parseTemplate(localStorage.getItem(TEMPLATE_KEY)) ||
      DEFAULT_TEMPLATE;

    setTemplate(scopedTemplate);
    setDraft(scopedTemplate);
    saveTemplateLocal(scopedTemplate);
    setLoadedTemplateScope(scopeKey);
  }, [loadedTemplateScope, schoolType, settingsMap, sid, student?.classId]);

  const subjectById = useMemo(() => new Map((subjects as any[]).map((subject) => [subject.id, subject])), [subjects]);

  const classSubjects = useMemo(() => {
    const seen = new Set<string>();
    return subjects.filter((s: any) => {
      if (s.classId !== student?.classId) return false;
      const key = getSubjectIdentity(s, s.name, s.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [subjects, student]);

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
      const key = getSubjectIdentity(subjectById.get(r.subjectId), r.subjectName, r.subjectId || r.id);
      const existing = resultMap.get(key);
      if (!existing || (Number(r.score) ?? 0) > (Number(existing.score) ?? 0)) {
        resultMap.set(key, r);
      }
    }

    const rows: any[] = [];
    const usedKeys = new Set<string>();

    for (const sub of classSubjects) {
      const subjectKey = getSubjectIdentity(sub, (sub as any).name, (sub as any).id);
      const result = resultMap.get(subjectKey) as any;
      const score = (result && result.score !== null && result.score !== undefined) ? Number(result.score) : null;
      const maxScore = result ? Number(result.maxScore || 100) : 100;
      const pct = (score !== null && !isNaN(score) && maxScore > 0) ? Math.round((score / maxScore) * 100) : null;
      const grade = pct !== null ? getGradeFromScale(pct) : '-';
      rows.push({ subject: (sub as any).name, code: getSubjectDisplayCode(sub), score, maxScore, pct, grade, remark: pct !== null ? getRemarkFromScale(grade) : '-', remarks: result?.remarks || '' });
      if (result) usedKeys.add(subjectKey);
    }

    for (const [key, result] of resultMap) {
      if (usedKeys.has(key)) continue;
      const sub = subjects.find((s: any) => getSubjectIdentity(s, s.name, s.id) === key) as any;
      const subjectName = sub?.name || result.subjectName || key;
      const score = (result.score !== null && result.score !== undefined) ? Number(result.score) : 0;
      const maxScore = Number(result.maxScore || 100);
      const pct = (maxScore > 0) ? Math.round((score / maxScore) * 100) : 0;
      const grade = getGradeFromScale(pct);
      rows.push({ subject: subjectName, code: getSubjectDisplayCode(sub), score, maxScore, pct, grade, remark: getRemarkFromScale(grade), remarks: result.remarks || '' });
    }

    return rows;
  }, [classSubjects, examResults, examId, studentId, exam, exams, subjects, subjectById, template.gradingScale]);

  // Ensure ReportCard computes class position using normalized totals (percentages)
  const classPosition = useMemo(() => {
    if (!studentId || !student?.classId) return null;
    if (!exam) return null;

    const classStudents = allStudents.filter(s => s.classId === student.classId && s.status === 'active');
    if (classStudents.length < 2) return null;

    // Include all exams that share the same name+term+year for this class (matches ExamMarks grouping)
    const groupedExams = exams.filter((e: any) => (
      e.name === exam.name && String(e.term) === String(exam.term) && String(e.year) === String(exam.year) && (e.classId === exam.classId || !e.classId)
    ));
    const groupedIds = new Set(groupedExams.map(e => e.id));

    const scores = classStudents.map(s => {
      const results = (examResults as any[]).filter(r => r.studentId === s.id && groupedIds.has(r.examId));
      const totalPct = results.reduce((sum: number, r: any) => {
        const sc = Number(r.score) || 0;
        const mx = Number(r.maxScore || 100) || 100;
        const pct = mx > 0 ? (sc / mx) * 100 : 0;
        return sum + pct;
      }, 0);
      const hasResults = results.length > 0;
      return { studentId: s.id, total: Math.round(totalPct), hasResults };
    });

    const withResults = scores.filter(s => s.hasResults).sort((a, b) => b.total - a.total);
    if (withResults.length < 2) return null;

    const pos = withResults.findIndex(s => s.studentId === studentId) + 1;
    return pos > 0 ? { position: pos, outOf: withResults.length } : null;
  }, [studentId, exam, allStudents, examResults, student, exams]);

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
      const subjectKey = getSubjectIdentity(subjectById.get(r.subjectId), r.subjectName, r.subjectId || r.id);
      if (!resultMap.has(subjectKey)) resultMap.set(subjectKey, {});
      const subjectResults = resultMap.get(subjectKey)!;
      if (!subjectResults[term] || Number(r.score) > Number(subjectResults[term].score)) {
        subjectResults[term] = r;
      }
    }

    const rows: any[] = [];
    const subjectsToProcess = new Set<string>();
    classSubjects.forEach((s: any) => subjectsToProcess.add(getSubjectIdentity(s, s.name, s.id)));
    resultMap.forEach((_, key) => subjectsToProcess.add(key));

    for (const key of subjectsToProcess) {
      const sub = subjects.find((s: any) => getSubjectIdentity(s, s.name, s.id) === key) as any;
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
  }, [studentId, exam, exams, examResults, subjects, subjectById, classSubjects, template.gradingScale]);

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
      const subjectKey = getSubjectIdentity(subjectById.get(r.subjectId), r.subjectName, r.subjectId || r.id);
      if (!resultMap.has(subjectKey)) resultMap.set(subjectKey, {});
      const subjectResults = resultMap.get(subjectKey)!;
      if (!subjectResults[term] || Number(r.score) > Number(subjectResults[term].score)) {
        subjectResults[term] = r;
      }
    }

    const rows: any[] = [];
    const subjectsToProcess = new Set<string>();
    classSubjects.forEach((s: any) => subjectsToProcess.add(getSubjectIdentity(s, s.name, s.id)));
    resultMap.forEach((_, key) => subjectsToProcess.add(key));

    for (const key of subjectsToProcess) {
      const sub = subjects.find((s: any) => getSubjectIdentity(s, s.name, s.id) === key) as any;
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
  }, [studentId, exam, exams, examResults, subjects, subjectById, classSubjects, template.gradingScale]);

  const totalScore = studentResults.reduce((s, r) => s + (r.score ?? 0), 0);
  const totalMax = studentResults.reduce((s, r) => s + r.maxScore, 0);
  const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
  const overallGrade = getGradeFromScale(overallPct);
  const overallRemark = getRemarkFromScale(overallGrade);

  const isImageLogo = displayLogo && (displayLogo.startsWith('http') || displayLogo.startsWith('data:'));
  const namedTemplateTypes: ReportTemplateType[] = ['signed', 'nursery', 'primary', 'o-level', 'a-level-new-curriculum', 'secondary-default-subjects'];
  const isNamedTemplate = namedTemplateTypes.includes(template.type);

  function renderLogoMark(className = 'h-16 w-16') {
    if (isImageLogo) return <img src={displayLogo} alt="School logo" className={`${className} object-contain`} />;
    return <div className={`${className} flex items-center justify-center rounded-full border-2 border-current text-2xl font-black`}>{displayLogo || 'S'}</div>;
  }

  function renderWatermark() {
    if (!displayLogo) return null;
    return (
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center opacity-[0.07]">
        {isImageLogo ? (
          <img src={displayLogo} alt="" className="h-72 w-72 object-contain" />
        ) : (
          <div className="flex h-72 w-72 items-center justify-center rounded-full border-[10px] border-slate-900 text-[9rem] font-black text-slate-900">
            {displayLogo || 'S'}
          </div>
        )}
      </div>
    );
  }

  function getNamedTemplateStyle() {
    switch (template.type) {
      case 'nursery':
        return { title: 'NURSERY TEMPLATE REPORT CARD', header: '#0f766e', accent: '#f59e0b', soft: '#fff7ed', table: 'Learning Area', score: 'Progress' };
      case 'primary':
        return { title: 'PRIMARY TEMPLATE REPORT CARD', header: '#1d4ed8', accent: '#22c55e', soft: '#eff6ff', table: 'Subject', score: 'Score' };
      case 'o-level':
        return { title: 'SECONDARY TEMPLATE REPORT CARD', header: '#064e3b', accent: '#0ea5e9', soft: '#ecfdf5', table: 'Subject', score: 'Score' };
      case 'a-level-new-curriculum':
        return { title: 'ADVANCED CURRICULUM TEMPLATE REPORT CARD', header: '#7f1d1d', accent: '#d97706', soft: '#fff7ed', table: 'Subject / Paper', score: 'Score' };
      case 'secondary-default-subjects':
        return { title: 'SECONDARY DEFAULT SUBJECTS', header: '#312e81', accent: '#14b8a6', soft: '#eef2ff', table: 'Default Subject', score: 'Status' };
      default:
        return { title: 'REPORT CARD WITH HEADTEACHER AND CLASS TEACHER SIGNATURES', header: '#1e3a5f', accent: '#16a34a', soft: '#f8fafc', table: 'Subject', score: 'Score' };
    }
  }

  function renderNamedTemplate() {
    const style = getNamedTemplateStyle();
    const rows = studentResults.length > 0 ? studentResults : classSubjects.map((subject: any) => ({
      subject: subject.name,
      code: getSubjectDisplayCode(subject),
      score: null,
      maxScore: 100,
      pct: null,
      grade: '-',
      remark: '-',
      remarks: '',
    }));
    const showCompetence = template.type === 'nursery' || template.type === 'a-level-new-curriculum';
    const showSubjectsOnly = template.type === 'secondary-default-subjects';

    return (
      <div className="relative overflow-hidden p-7 text-slate-900" style={{ minHeight: '1050px' }}>
        {renderWatermark()}
        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between gap-4 border-b-4 pb-3" style={{ borderColor: style.header }}>
            <div className="flex items-center gap-3">
              <div className="text-slate-900">{renderLogoMark('h-16 w-16')}</div>
              <div>
                <h1 className="text-xl font-black uppercase leading-tight">
                  <LiveEditable value={displaySchoolName} onSave={v => updateTemplate({ schoolName: v })} isLiveEditing={isLiveEditing} />
                </h1>
                <p className="text-[11px] font-semibold text-slate-600">
                  <LiveEditable value={displayAddress || 'School address'} onSave={v => updateTemplate({ schoolAddress: v })} isLiveEditing={isLiveEditing} />
                </p>
                <p className="text-[10px] font-bold text-slate-500">{editableText('named.phoneLabel', 'Phone')}: {displayPhone || '-'} {displayEmail ? <> | {editableText('named.emailLabel', 'Email')}: {displayEmail}</> : ''}</p>
              </div>
            </div>
            <div className="rounded-lg px-4 py-3 text-right text-white" style={{ backgroundColor: style.header }}>
              <p className="text-[10px] font-black uppercase tracking-wide">{editableText('named.termLabel', 'Term')} {exam?.term || '-'} / {exam?.year || academicYear}</p>
              <p className="text-lg font-black uppercase leading-tight">{editableText(`named.title.${template.type}`, style.title)}</p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border p-3 text-xs" style={{ backgroundColor: style.soft, borderColor: `${style.header}40` }}>
            {[
              ['named.studentName', 'Student Name', `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || '-'],
              ['named.studentId', 'Student ID', student?.studentId || student?.admissionNo || '-'],
              ['named.class', 'Class', className || '-'],
              ['named.exam', 'Exam', exam?.name || '-'],
              ['named.academicYear', 'Academic Year', academicYear],
              ['named.position', 'Position', classPosition ? `${classPosition.position}${ordinal(classPosition.position)} of ${classPosition.outOf}` : '-'],
            ].map(([key, label, value]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-24 shrink-0 font-black uppercase text-slate-600">{editableText(String(key), String(label))}:</span>
                <span className="flex-1 border-b border-slate-400 font-bold">{value}</span>
              </div>
            ))}
          </div>

          <table className="mb-4 w-full border-collapse text-xs">
            <thead>
              <tr className="text-white" style={{ backgroundColor: style.header }}>
                <th className="border border-white/30 px-2 py-2 text-left font-black uppercase">{editableText('named.subjectHeader', style.table)}</th>
                <th className="border border-white/30 px-2 py-2 text-center font-black uppercase">{editableText('named.codeHeader', 'Code')}</th>
                {!showSubjectsOnly && <th className="border border-white/30 px-2 py-2 text-center font-black uppercase">{editableText('named.scoreHeader', style.score)}</th>}
                {!showSubjectsOnly && <th className="border border-white/30 px-2 py-2 text-center font-black uppercase">{editableText('named.maxHeader', 'Max')}</th>}
                {!showSubjectsOnly && <th className="border border-white/30 px-2 py-2 text-center font-black uppercase">{editableText('named.gradeHeader', 'Grade')}</th>}
                {showCompetence && <th className="border border-white/30 px-2 py-2 text-left font-black uppercase">{editableText('named.competencyHeader', 'Competency / Comment')}</th>}
                {!showCompetence && <th className="border border-white/30 px-2 py-2 text-left font-black uppercase">{editableText('named.remarksHeader', 'Remarks')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, index: number) => (
                <tr key={`${row.subject}-${index}`} style={{ backgroundColor: index % 2 === 0 ? style.soft : '#ffffff' }}>
                  <td className="border border-slate-300 px-2 py-1.5 font-bold">{row.subject}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-semibold">{row.code || '-'}</td>
                  {!showSubjectsOnly && <td className="border border-slate-300 px-2 py-1.5 text-center">{row.score ?? '-'}</td>}
                  {!showSubjectsOnly && <td className="border border-slate-300 px-2 py-1.5 text-center">{row.maxScore ?? '-'}</td>}
                  {!showSubjectsOnly && <td className="border border-slate-300 px-2 py-1.5 text-center font-black">{row.grade || '-'}</td>}
                  <td className="border border-slate-300 px-2 py-1.5">{showSubjectsOnly ? editableText('named.defaultSubjectStatus', 'Default subject') : row.remarks || row.remark || '-'}</td>
                </tr>
              ))}
              {!showSubjectsOnly && (
                <tr className="font-black text-white" style={{ backgroundColor: style.header }}>
                  <td className="border border-white/30 px-2 py-2 uppercase">{editableText('named.overallLabel', 'Overall')}</td>
                  <td className="border border-white/30 px-2 py-2 text-center">-</td>
                  <td className="border border-white/30 px-2 py-2 text-center">{totalScore}</td>
                  <td className="border border-white/30 px-2 py-2 text-center">{totalMax}</td>
                  <td className="border border-white/30 px-2 py-2 text-center">{overallGrade}</td>
                  <td className="border border-white/30 px-2 py-2">{overallRemark}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mb-5 grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-lg border p-3" style={{ borderColor: `${style.header}55` }}>
              <p className="mb-2 font-black uppercase" style={{ color: style.header }}><LiveEditable value={template.teacherCommentLabel} onSave={v => updateTemplate({ teacherCommentLabel: v })} isLiveEditing={isLiveEditing} /></p>
              <div className="min-h-16 border-b border-slate-300">
                <LiveEditable value={template.overallPerformanceTemplate} onSave={v => updateTemplate({ overallPerformanceTemplate: v })} isLiveEditing={isLiveEditing} />
              </div>
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: `${style.header}55` }}>
              <p className="mb-2 font-black uppercase" style={{ color: style.header }}>{editableText('named.gradingSummary', 'Grading Summary')}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {template.gradingScale.slice(0, 8).map((scale, index) => (
                  <p key={`${scale.grade}-${index}`}>
                    <span className="font-black">
                      <LiveEditable value={scale.grade} onSave={value => updateTemplateGradeScale(index, { grade: value })} isLiveEditing={isLiveEditing} />
                    </span>{' '}
                    <span>
                      <LiveEditable value={`${scale.min}-${scale.max}`} onSave={value => {
                        const [min, max] = value.split('-').map(part => Number(part.trim()));
                        updateTemplateGradeScale(index, {
                          min: Number.isFinite(min) ? min : scale.min,
                          max: Number.isFinite(max) ? max : scale.max,
                        });
                      }} isLiveEditing={isLiveEditing} />
                    </span>: <LiveEditable value={scale.remark} onSave={value => updateTemplateGradeScale(index, { remark: value })} isLiveEditing={isLiveEditing} />
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs">
            {[
              template.showClassTeacher ? template.classTeacherLabel : "Teacher's Signature:",
              template.principalSignatureLabel,
              template.parentSignatureLabel,
            ].map(label => (
              <div key={label}>
                <div className="mb-2 h-10 border-b-2" style={{ borderColor: style.header }} />
                <p className="font-black uppercase">
                  <LiveEditable value={label} onSave={v => {
                    if (label === template.parentSignatureLabel) updateTemplate({ parentSignatureLabel: v });
                    else if (label === template.principalSignatureLabel) updateTemplate({ principalSignatureLabel: v });
                    else updateTemplate({ classTeacherLabel: v });
                  }} isLiveEditing={isLiveEditing} />
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-md px-3 py-2 text-center text-[10px] font-bold uppercase text-white" style={{ backgroundColor: style.header }}>
            <LiveEditable value={template.footerText || 'This report card is generated from Schofy school records.'} onSave={v => updateTemplate({ footerText: v })} isLiveEditing={isLiveEditing} />
          </div>
        </div>
      </div>
    );
  }

  function openEditor() {
    setDraft({ ...template });
    setEditorTab('school');
    setShowEditor(true);
  }

  async function handleSave(scope: TemplateSaveScope) {
    setSaving(true);
    const dataToSave = showEditor ? draft : template;
    try {
      saveTemplateLocal(dataToSave);
      setTemplate({ ...dataToSave });
      const serialized = JSON.stringify(dataToSave);
      if (scope === 'class' && student?.classId) {
        localStorage.setItem(classTemplateKey(sid, student.classId), serialized);
        await dataService.saveSettings(sid, { [`reportTemplateClass_${student.classId}`]: serialized });
        addToast(`Template saved for ${className || 'this class'}`, 'success');
      } else if (scope === 'schoolType') {
        localStorage.setItem(schoolTypeTemplateKey(sid, schoolType), serialized);
        await dataService.saveSettings(sid, { [`reportTemplateSchoolType_${schoolType}`]: serialized });
        addToast(`Template saved for ${String(schoolType).replace(/_/g, ' ')} schools`, 'success');
      } else if (scope === 'all') {
        await dataService.saveSettings(sid, { reportTemplate: serialized });
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
  const currentTemplateIndex = Math.max(0, TEMPLATE_OPTIONS.findIndex(option => option.type === template.type));
  const currentTemplateOption = TEMPLATE_OPTIONS[currentTemplateIndex] || TEMPLATE_OPTIONS[0];

  const updateTemplate = (updates: Partial<ReportTemplate>) => {
    addToHistory(template);
    const newTemplate = { ...template, ...updates };
    setTemplate(newTemplate);
    saveTemplateLocal(newTemplate);
  };

  const getText = (key: string, fallback: string) => template.textLabels?.[key] || fallback;
  const setText = (key: string, value: string) => {
    updateTemplate({ textLabels: { ...(template.textLabels || {}), [key]: value } });
  };
  const editableText = (key: string, fallback: string) => (
    <LiveEditable value={getText(key, fallback)} onSave={value => setText(key, value)} isLiveEditing={isLiveEditing} />
  );
  const editableKnownLabel = (label: string) => (
    <LiveEditable
      value={label}
      onSave={value => {
        if (label === template.teacherCommentLabel) updateTemplate({ teacherCommentLabel: value });
        else if (label === template.classTeacherLabel) updateTemplate({ classTeacherLabel: value });
        else if (label === template.principalSignatureLabel) updateTemplate({ principalSignatureLabel: value });
        else if (label === template.parentSignatureLabel) updateTemplate({ parentSignatureLabel: value });
        else if (label === template.nextTermLabel) updateTemplate({ nextTermLabel: value });
        else setText(`label.${label}`, value);
      }}
      isLiveEditing={isLiveEditing}
    />
  );
  const updateTemplateGradeScale = (index: number, updates: Partial<ReportTemplate['gradingScale'][number]>) => {
    updateTemplate({
      gradingScale: template.gradingScale.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item),
    });
  };

  const switchTemplate = (direction: -1 | 1) => {
    const nextIndex = (currentTemplateIndex + direction + TEMPLATE_OPTIONS.length) % TEMPLATE_OPTIONS.length;
    const nextTemplate = { ...template, type: TEMPLATE_OPTIONS[nextIndex].type };
    addToHistory(template);
    setTemplate(nextTemplate);
    if (showEditor) setDraft(prev => ({ ...prev, type: TEMPLATE_OPTIONS[nextIndex].type }));
    saveTemplateLocal(nextTemplate);
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') updateTemplate({ schoolLogo: reader.result });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 print:hidden flex-wrap">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white flex-1">Report Card</h1>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => switchTemplate(-1)}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
            title="Previous template"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="min-w-[9rem] px-2 text-center text-xs font-bold text-slate-700 dark:text-slate-200">
            {editableText(`template.option.${currentTemplateOption.type}`, currentTemplateOption.label)}
          </span>
          <button
            type="button"
            onClick={() => switchTemplate(1)}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
            title="Next template"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        
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
              onClick={() => handleSave('class')} 
              disabled={saving || !student?.classId}
              className="btn btn-secondary flex items-center gap-2 ml-2"
            >
              <GraduationCap size={16} /> {saving ? 'Saving...' : 'Class'}
            </button>
            <button 
              onClick={() => handleSave('schoolType')} 
              className="btn btn-primary flex items-center gap-2 ml-2"
              disabled={saving}
            >
              <Building size={16} /> {saving ? 'Saving...' : 'Type'}
            </button>
            <button 
              onClick={() => handleSave('all')} 
              className="btn btn-primary flex items-center gap-2"
              disabled={saving}
              style={{ backgroundColor: '#059669', borderColor: '#059669' }}
            >
              <Settings size={16} /> {saving ? 'Saving...' : 'All'}
            </button>
          </div>
        )}

        <button onClick={openEditor} className="btn btn-secondary flex items-center gap-2">
          <Settings size={16} /> Full Settings
        </button>
        <button onClick={() => openPrintPreview('Report Card', '#report-card-print')} className="btn btn-primary flex items-center gap-2">
          <Download size={16} /> Export PDF
        </button>
      </div>

      {/* ΓöÇΓöÇ Report Card ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
      <div className={`grid gap-4 print:block ${isLiveEditing ? 'lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}`}>
        {isLiveEditing && (
          <aside className="print:hidden h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:sticky lg:top-20">
            <div className="mb-3 flex items-center gap-2">
              <Palette size={16} className="text-primary-600" />
              <h2 className="text-sm font-black text-slate-800 dark:text-white">Template Tools</h2>
            </div>
            <div className="space-y-3">
              {[
                ['Text', template.textColor || '#0f172a', (value: string) => updateTemplate({ textColor: value })],
                ['Header', template.headerColor, (value: string) => updateTemplate({ headerColor: value })],
                ['Accent', template.accentColor, (value: string) => updateTemplate({ accentColor: value })],
              ].map(([label, value, onChange]: any) => (
                <div key={label}>
                  <label className="mb-1 block text-xs font-bold text-slate-500">{label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-9 w-10 rounded border border-slate-200" />
                    <input value={value} onChange={e => onChange(e.target.value)} className="form-input h-9 min-h-0 flex-1 px-2 py-1 font-mono text-xs" />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  ['#1a5f5f', '#7ecece'],
                  ['#1d4ed8', '#22c55e'],
                  ['#7c2222', '#d97706'],
                  ['#1e3a5f', '#16a34a'],
                ].map(([header, accent]) => (
                  <button key={`${header}-${accent}`} type="button" onClick={() => updateTemplate({ headerColor: header, accentColor: accent })} className="h-8 rounded-lg border border-slate-200 p-1">
                    <span className="block h-full rounded" style={{ background: `linear-gradient(90deg, ${header} 50%, ${accent} 50%)` }} />
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Logo</label>
                <div className="flex gap-2">
                  <input value={template.schoolLogo || ''} onChange={e => updateTemplate({ schoolLogo: e.target.value })} className="form-input h-9 min-h-0 flex-1 px-2 py-1 text-xs" placeholder="S or image URL" />
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="rounded-lg border border-slate-200 px-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700" title="Upload logo">
                    <Upload size={15} />
                  </button>
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </div>
            </div>
          </aside>
        )}

      <div id="report-card-print" className="bg-white mx-auto max-w-2xl shadow-xl print:shadow-none print:max-w-full overflow-hidden" style={{ fontFamily: 'Arial, sans-serif', '--report-template-text-color': template.textColor || '#0f172a' } as React.CSSProperties}>
        {isNamedTemplate ? (
          renderNamedTemplate()
        ) : template.type === 'modern' ? (
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
                    <span>{editableText('modern.addrLabel', 'Addr')}: <LiveEditable value={displayAddress || 'Address'} onSave={v => updateTemplate({ schoolAddress: v })} isLiveEditing={isLiveEditing} /></span>
                    <span>{editableText('modern.telLabel', 'Tel')}: <LiveEditable value={displayPhone || 'Phone'} onSave={v => updateTemplate({ schoolPhone: v })} isLiveEditing={isLiveEditing} /></span>
                    <span>{editableText('modern.mailLabel', 'Mail')}: <LiveEditable value={displayEmail || 'Email'} onSave={v => updateTemplate({ schoolEmail: v })} isLiveEditing={isLiveEditing} /></span>
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
                  {displayLogo && (displayLogo.startsWith('http') || displayLogo.startsWith('data:')) ? (
                    <img src={displayLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-3xl font-black text-indigo-600">
                      <LiveEditable 
                        value={displayLogo || 'S'} 
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
                  { key: 'modern.studentName', label: 'Student Name:', value: `${student.firstName} ${student.lastName}` },
                  { key: 'modern.studentId', label: 'Student ID:', value: student.studentId || student.admissionNo },
                  { key: 'modern.class', label: 'Class:', value: className },
                  { key: 'modern.academicYear', label: 'Academic Year:', value: academicYear },
                  { key: 'modern.exam', label: 'Exam:', value: exam?.name || '-' },
                  { key: 'modern.term', label: 'Term:', value: `Term ${exam?.term} - ${exam?.year}` },
                  ...(classPosition ? [{ key: 'modern.position', label: 'Position:', value: `${classPosition.position}${ordinal(classPosition.position)} out of ${classPosition.outOf}` }] : []),
                ].map(({ key, label, value }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-600 whitespace-nowrap w-28 shrink-0">{editableText(key, label)}</span>
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
                      <th className="px-2 py-1.5 text-left font-bold uppercase">{editableText('modern.subjectHeader', 'Subject')}</th>
                      <th className="px-2 py-1.5 text-center font-bold uppercase">{editableText('modern.scoreHeader', 'Score')}</th>
                      <th className="px-2 py-1.5 text-center font-bold uppercase">{editableText('modern.maxHeader', 'Max')}</th>
                      <th className="px-2 py-1.5 text-center font-bold uppercase">{editableText('modern.percentHeader', '%')}</th>
                      <th className="px-2 py-1.5 text-center font-bold uppercase">{editableText('modern.gradeHeader', 'Grade')}</th>
                      <th className="px-2 py-1.5 text-left font-bold uppercase">{editableText('modern.remarksHeader', 'Remarks')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentResults.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400 text-xs">{editableText('modern.noResults', 'No results recorded for this exam')}</td></tr>
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
                      <td className="px-2 py-1.5 font-bold uppercase">{editableText('modern.overallLabel', 'Overall')}</td>
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
                  { label: getText('modern.excellentIn', 'Excellent In:'), editKey: 'modern.excellentIn', value: studentResults.filter(r => r.grade.startsWith('D')).map(r => r.subject).join(', ') },
                  { label: getText('modern.needsImprovement', 'Needs Improvement In:'), editKey: 'modern.needsImprovement', value: studentResults.filter(r => r.grade === 'F9').map(r => r.subject).join(', ') },
                  ...(template.showClassTeacher ? [{ label: template.classTeacherLabel, value: '' }] : []),
                  { label: template.principalSignatureLabel, value: '' },
                  ...(template.showNextTerm ? [{ label: template.nextTermLabel, value: '' }] : []),
                ].map(({ label, value, editKey }: any) => (
                  <div key={label} className="flex items-end gap-3">
                    <span className="text-[10px] font-bold uppercase text-slate-600 w-40 shrink-0 pb-0.5">{editKey ? editableText(editKey, label) : editableKnownLabel(label)}</span>
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
                      <div className="px-2 py-1 font-bold text-[10px] uppercase text-white mb-1.5" style={{ backgroundColor: hdr }}>{editableText('modern.behaviorAssessment', 'Behavior Assessment')}</div>
                      {template.behaviorItems.map(b => (
                        <div key={b} className="flex items-center gap-2 py-0.5 border-b border-slate-100">
                          <div className="w-6 border-b border-slate-400 text-center text-[10px]">v</div>
                          <span className="text-[10px] uppercase text-slate-600">
                            <LiveEditable value={b} onSave={value => updateTemplate({ behaviorItems: template.behaviorItems.map(item => item === b ? value : item) })} isLiveEditing={isLiveEditing} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {template.showGradingSystem && (
                    <div>
                      <div className="px-2 py-1 font-bold text-[10px] uppercase text-white mb-1.5" style={{ backgroundColor: hdr }}>{editableText('modern.gradingSystem', 'Grading System')}</div>
                      {template.gradingScale.map(({ grade, min, max, remark }, index) => (
                        <div key={`${grade}-${index}`} className="py-0.5 border-b border-slate-100">
                          <span className="text-[10px] font-bold text-slate-700">
                            <LiveEditable value={grade} onSave={value => updateTemplateGradeScale(index, { grade: value })} isLiveEditing={isLiveEditing} /> (
                            <LiveEditable value={`${min}-${max}%`} onSave={value => {
                              const [nextMin, nextMax] = value.replace('%', '').split('-').map(part => Number(part.trim()));
                              updateTemplateGradeScale(index, {
                                min: Number.isFinite(nextMin) ? nextMin : min,
                                max: Number.isFinite(nextMax) ? nextMax : max,
                              });
                            }} isLiveEditing={isLiveEditing} />):{' '}
                          </span>
                          <span className="text-[10px] text-slate-600">
                            <LiveEditable value={remark} onSave={value => updateTemplateGradeScale(index, { remark: value })} isLiveEditing={isLiveEditing} />
                          </span>
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
                  <h3 className="text-lg font-serif font-bold text-[#2d3748] border-b-2 border-slate-200 pb-1 mb-4">{editableText('high.studentInformation', 'Student Information:')}</h3>
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <label className="text-xs font-bold block mb-1">{editableText('high.nameLabel', 'Name:')}</label>
                      <div className="border border-slate-300 rounded px-3 py-1.5 text-sm bg-slate-50 min-h-[38px] flex items-center">{student.firstName} {student.lastName}</div>
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1">{editableText('high.gradeLabel', 'Grade:')}</label>
                      <div className="border border-slate-300 rounded px-3 py-1.5 text-sm bg-slate-50 min-h-[38px] flex items-center">{className}</div>
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1">{editableText('high.schoolYearLabel', 'School Year:')}</label>
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
                          <th className="border border-slate-300 px-4 py-2 text-left font-bold">{editableText('high.subjectHeader', 'Subject')}</th>
                          <th className="border border-slate-300 px-4 py-2 text-center font-bold">{editableText('high.firstSemesterHeader', '1st Semester')}</th>
                          <th className="border border-slate-300 px-4 py-2 text-center font-bold">{editableText('high.secondSemesterHeader', '2nd Semester')}</th>
                          <th className="border border-slate-300 px-4 py-2 text-center font-bold">{editableText('high.finalGradeHeader', 'Final Grade')}</th>
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
                    <h3 className="text-md font-bold text-[#2d3748] mb-3">{editableText('high.gradingScale', 'Grading Scale:')}</h3>
                    <ul className="space-y-1 text-xs">
                      {template.gradingScale.slice(0, 5).map((s, index) => (
                        <li key={`${s.grade}-${index}`} className="flex gap-2">
                          <span className="font-bold w-4">* <LiveEditable value={s.grade} onSave={value => updateTemplateGradeScale(index, { grade: value })} isLiveEditing={isLiveEditing} />:</span>
                          <span>
                            <LiveEditable value={`${s.min}-${s.max}%`} onSave={value => {
                              const [min, max] = value.replace('%', '').split('-').map(part => Number(part.trim()));
                              updateTemplateGradeScale(index, {
                                min: Number.isFinite(min) ? min : s.min,
                                max: Number.isFinite(max) ? max : s.max,
                              });
                            }} isLiveEditing={isLiveEditing} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h3 className="text-md font-bold text-[#2d3748] mb-3">{editableText('high.attendance', 'Attendance:')}</h3>
                    <ul className="space-y-1 text-xs">
                      <li className="flex gap-2">
                        <span className="font-bold">{editableText('high.daysPresent', '* Days Present:')}</span>
                        <span>170</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold">{editableText('high.daysAbsent', '* Days Absent:')}</span>
                        <span>10</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold">{editableText('high.tardies', '* Tardies:')}</span>
                        <span>3</span>
                      </li>
                    </ul>
                  </section>
                </div>

                {/* Comments Section */}
                <section>
                  <h3 className="text-md font-bold text-[#2d3748] mb-2">{editableText('high.comments', 'Comments:')}</h3>
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
                  {displayLogo && (displayLogo.startsWith('http') || displayLogo.startsWith('data:')) ? (
                    <img src={displayLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-4xl font-black text-indigo-600">
                      <LiveEditable value={displayLogo || 'S'} onSave={v => updateTemplate({ schoolLogo: v })} isLiveEditing={isLiveEditing} />
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
                  { key: 'classic.idNumber', label: 'ID Number:', value: student.studentId || student.admissionNo },
                  { key: 'classic.name', label: 'Name:', value: `${student.firstName} ${student.lastName}` },
                  { key: 'classic.age', label: 'Age:', value: student.dob ? (new Date().getFullYear() - new Date(student.dob).getFullYear()) : 'N/A' },
                  { key: 'classic.gender', label: 'Gender:', value: student.gender || 'N/A' },
                  { key: 'classic.schoolYear', label: 'School Year:', value: `${academicYear}-${Number(academicYear)+1}` },
                  { key: 'classic.gradeSection', label: 'Grade & Section:', value: className },
                ].map(({ key, label, value }) => (
                  <div key={label} className="flex items-end gap-2">
                    <span className="text-xs font-black uppercase w-32 shrink-0">{editableText(key, label)}</span>
                    <span className="flex-1 border-b-2 border-[#1e3a5f] pb-0.5 text-sm font-bold text-center px-2">{value}</span>
                  </div>
                ))}
              </div>

              {/* Message */}
              <div className="mb-8 space-y-4">
                <p className="text-sm font-bold">{editableText('classic.dearParents', 'Dear Parents,')}</p>
                <p className="text-xs leading-relaxed font-bold indent-12">
                  {editableText('classic.message', 'This report card shows the ability and progress your child has made in the different learning areas as well as his/her core values.')}
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
                      <th className="border border-white/20 px-3 py-2 text-left font-black uppercase">{editableText('classic.subjectHeader', 'Subject')}</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">{editableText('classic.q1Header', '1st Qtr')}</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">{editableText('classic.q2Header', '2nd Qtr')}</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">{editableText('classic.q3Header', '3rd Qtr')}</th>
                      <th className="border border-white/20 px-2 py-2 text-center font-black uppercase">{editableText('classic.q4Header', '4th Qtr')}</th>
                      <th className="border border-white/20 px-3 py-2 text-center font-black uppercase">{editableText('classic.remarksHeader', 'Remarks')}</th>
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
                  <p className="text-[10px] font-black uppercase mb-2">{editableText('classic.description', 'Description')}</p>
                  <div className="space-y-1 text-[10px] font-bold">
                    <p>{editableText('classic.excellent', 'Excellent')}</p>
                    <p>{editableText('classic.good', 'Good')}</p>
                    <p>{editableText('classic.satisfactory', 'Satisfactory')}</p>
                    <p>{editableText('classic.belowAverage', 'Below Average')}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase mb-2">{editableText('classic.gradingScale', 'Grading Scale')}</p>
                  <div className="space-y-1 text-[10px] font-bold">
                    {template.gradingScale.slice(0, 4).map((scale, index) => (
                      <p key={`${scale.grade}-${index}`}>
                        (<LiveEditable value={scale.grade} onSave={value => updateTemplateGradeScale(index, { grade: value })} isLiveEditing={isLiveEditing} />){' '}
                        <LiveEditable value={`${scale.min}-${scale.max}`} onSave={value => {
                          const [min, max] = value.split('-').map(part => Number(part.trim()));
                          updateTemplateGradeScale(index, {
                            min: Number.isFinite(min) ? min : scale.min,
                            max: Number.isFinite(max) ? max : scale.max,
                          });
                        }} isLiveEditing={isLiveEditing} />
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase mb-2">{editableText('classic.remarks', 'Remarks')}</p>
                  <div className="space-y-1 text-[10px] font-bold">
                    <p>{editableText('classic.passed1', 'Passed')}</p>
                    <p>{editableText('classic.passed2', 'Passed')}</p>
                    <p>{editableText('classic.passed3', 'Passed')}</p>
                    <p>{editableText('classic.failed', 'Failed')}</p>
                  </div>
                </div>
              </div>

              {/* Performance Summary */}
              <div className="space-y-4 pt-4 border-t-2 border-[#1e3a5f]">
                <div className="flex gap-4">
                  <p className="text-xs font-black uppercase w-48 shrink-0">{editableText('classic.overallPerformance', 'Overall Performance:')}</p>
                  <p className="text-xs font-bold leading-relaxed">
                    <span className="border-b border-[#1e3a5f] px-4 font-black">{student.firstName} {student.lastName}</span> {template.overallPerformanceTemplate}
                  </p>
                </div>
                <div className="flex gap-4">
                  <p className="text-xs font-black uppercase w-48 shrink-0">{editableText('classic.strengths', 'Strengths:')}</p>
                  <p className="text-xs font-bold leading-relaxed border-b border-slate-300 flex-1 min-h-[1.5rem]">
                    <LiveEditable value={template.strengthsTemplate} onSave={v => updateTemplate({ strengthsTemplate: v })} isLiveEditing={isLiveEditing} />
                  </p>
                </div>
                <div className="flex gap-4">
                  <p className="text-xs font-black uppercase w-48 shrink-0">{editableText('classic.areasForImprovement', 'Areas for Improvement:')}</p>
                  <p className="text-xs font-bold leading-relaxed border-b border-slate-300 flex-1 min-h-[1.5rem]">
                    <LiveEditable value={template.improvementsTemplate} onSave={v => updateTemplate({ improvementsTemplate: v })} isLiveEditing={isLiveEditing} />
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {(template.footerText || isLiveEditing) && (
          <div className="px-5 py-2 text-center text-[10px] text-slate-500 italic">
            <LiveEditable value={template.footerText || 'Footer text'} onSave={value => updateTemplate({ footerText: value })} isLiveEditing={isLiveEditing} />
          </div>
        )}
        <div className="h-6 mt-1" style={{ backgroundColor: acc }} />
      </div>
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
            <div className="flex flex-wrap border-b border-slate-200 dark:border-slate-700 shrink-0">
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
                    <div className="grid grid-cols-1 gap-3 mt-1.5 sm:grid-cols-2">
                      {TEMPLATE_OPTIONS.map(({ type, label, icon: Icon }) => (
                        <button
                          key={type}
                          onClick={() => setDraft(p => ({ ...p, type }))}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${draft.type === type ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-100 dark:border-slate-700 hover:border-slate-200'}`}
                        >
                          <Icon size={22} className={draft.type === type ? 'text-primary-600' : 'text-slate-400'} />
                          <span className={`text-xs font-bold ${draft.type === type ? 'text-primary-700' : 'text-slate-600 dark:text-slate-300'}`}>{label}</span>
                        </button>
                      ))}
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
              <button onClick={() => handleSave('device')} disabled={saving} className="btn btn-secondary flex items-center gap-2 flex-1">
                <Check size={16} /> Save Device
              </button>
              <button onClick={() => handleSave('class')} disabled={saving || !student?.classId} className="btn btn-primary flex items-center gap-2 flex-1">
                <GraduationCap size={16} /> {saving ? 'Saving...' : 'Save Class'}
              </button>
              <button onClick={() => handleSave('schoolType')} disabled={saving} className="btn btn-primary flex items-center gap-2 flex-1" style={{ backgroundColor: '#0f766e', borderColor: '#0f766e' }}>
                <Building size={16} /> {saving ? 'Saving...' : 'Save School Type'}
              </button>
              <button onClick={() => handleSave('all')} disabled={saving} className="btn btn-primary flex items-center gap-2 flex-1" style={{ backgroundColor: '#059669', borderColor: '#059669' }}>
                <Eye size={16} /> {saving ? 'Saving...' : 'Save All'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      <style>{`
        #report-card-print .live-editable-text {
          color: var(--report-template-text-color, inherit);
        }
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
