import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Trash2, Users, GraduationCap, Award, FileText, Search, BarChart3, ChevronDown, ChevronRight, Upload, X, ArrowRight, Check, Filter, BookOpen, Pencil } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { ExamResult } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useActiveStudents, useStudents } from '../contexts/StudentsContext';
import { useTableData } from '../lib/store';
import { useConfirm } from '../components/ConfirmModal';

interface StudentGrade extends ExamResult {
  studentName: string;
  subjectName: string;
  term: string;
  year: string;
  examType: string;
}

const ugandaGrades = [
  { grade: 'D1', min: 90, max: 100, points: 1, remark: 'Distinction' },
  { grade: 'D2', min: 85, max: 89, points: 2, remark: 'Distinction' },
  { grade: 'C3', min: 80, max: 84, points: 3, remark: 'Credit' },
  { grade: 'C4', min: 75, max: 79, points: 4, remark: 'Credit' },
  { grade: 'C5', min: 70, max: 74, points: 5, remark: 'Credit' },
  { grade: 'C6', min: 65, max: 69, points: 6, remark: 'Credit' },
  { grade: 'P7', min: 60, max: 64, points: 7, remark: 'Pass' },
  { grade: 'P8', min: 50, max: 59, points: 8, remark: 'Pass' },
  { grade: 'F9', min: 0, max: 49, points: 9, remark: 'Fail' },
];

function getGrade(score: number): { grade: string; remark: string; points: number } {
  const entry = ugandaGrades.find(g => score >= g.min && score <= g.max);
  return entry || { grade: 'F9', remark: 'Fail', points: 9 };
}

export default function Grades() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editGrade, setEditGrade] = useState<{ id: string; studentName: string; subjectName: string; score: string; maxScore: string } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isImportingGrades, setIsImportingGrades] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const [filterTerm, setFilterTerm] = useState('all');
  const [showClassFilter, setShowClassFilter] = useState(false);
  const [showTermFilter, setShowTermFilter] = useState(false);
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const classFilterRef = useRef<HTMLDivElement>(null);
  const termFilterRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<ExamResult>[]>([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDescription, setInvoiceDescription] = useState('Examination Fee');
  const [invoiceTerm, setInvoiceTerm] = useState(() => {
    try { const r = localStorage.getItem(`schofy_settings_${schoolId || ''}`); if (r) return JSON.parse(r).currentTerm || '1'; } catch {}
    return '1';
  });

  const { data: examResults } = useTableData(sid, 'examResults');
  const { data: subjects } = useTableData(sid, 'subjects');
  const { data: examsData } = useTableData(sid, 'exams');
  const { data: allClassesData } = useTableData(sid, 'classes');

  const activeStudents = useActiveStudents();
  const { students: allStudents } = useStudents();

  // All active students across all classes
  const students = activeStudents;

  const grades = useMemo(() => {
    return examResults.map((g: any) => {
      const student = allStudents.find(s => s.id === g.studentId);
      const subject = subjects.find((s: any) => s.id === g.subjectId);
      const exam = examsData.find((e: any) => e.id === g.examId) as any;
      return {
        ...g,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
        subjectName: subject ? (subject as any).name : (g.subjectName || 'Unknown'),
        term: exam?.term || g.term || '1',
        year: exam?.year || g.year || new Date().getFullYear().toString(),
        examType: g.examType || 'Exam',
      } as StudentGrade;
    });
  }, [examResults, allStudents, subjects, examsData]);

  const gradeExpectedFields = [
    { key: 'studentId', label: 'Student ID', required: true },
    { key: 'subjectId', label: 'Subject ID', required: true },
    { key: 'score', label: 'Score', required: true },
    { key: 'maxScore', label: 'Max Score', required: true },
  ];

  // Bulk entry form state - default term from settings
  const [bulkForm, setBulkForm] = useState(() => {
    let term = '1';
    try { const r = localStorage.getItem(`schofy_settings_${schoolId || ''}`); if (r) term = JSON.parse(r).currentTerm || '1'; } catch {}
    return { classId: '', studentId: '', examType: 'Mid-Term', term, year: new Date().getFullYear().toString(), maxScore: '100' };
  });
  // scores keyed by subjectId
  const [bulkScores, setBulkScores] = useState<Record<string, string>>({});
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Students for selected class
  const studentsForBulkClass = useMemo(() => {
    if (!bulkForm.classId) return [];
    return [...activeStudents]
      .filter(s => s.classId === bulkForm.classId)
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [bulkForm.classId, activeStudents]);

  // Subjects for selected class
  const subjectsForBulkClass = useMemo(() => {
    if (!bulkForm.classId) return [];
    return (subjects as any[]).filter(s => s.classId === bulkForm.classId);
  }, [bulkForm.classId, subjects]);

  // Pre-fill existing scores when student changes
  function handleBulkStudentChange(studentId: string) {
    setBulkForm(p => ({ ...p, studentId }));
    if (!studentId) { setBulkScores({}); return; }
    // Find existing results for this student/exam/term/year
    const existingExam = (examsData as any[]).find(ex =>
      ex.examType === bulkForm.examType &&
      String(ex.term) === bulkForm.term &&
      String(ex.year) === bulkForm.year
    );
    if (!existingExam) { setBulkScores({}); return; }
    const existing: Record<string, string> = {};
    (examResults as any[])
      .filter(r => r.studentId === studentId && r.examId === existingExam.id)
      .forEach(r => { if (r.subjectId) existing[r.subjectId] = String(r.score); });
    setBulkScores(existing);
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = schoolId || user?.id;
    if (!id || !bulkForm.studentId || !bulkForm.classId) {
      addToast('Select a class and student', 'error'); return;
    }
    const entries = Object.entries(bulkScores).filter(([, v]) => v.trim() !== '');
    if (entries.length === 0) { addToast('Enter at least one score', 'error'); return; }
    setBulkSubmitting(true);
    try {
      const now = new Date().toISOString();
      // Find or create exam
      let existingExam = (examsData as any[]).find(ex =>
        ex.examType === bulkForm.examType &&
        String(ex.term) === bulkForm.term &&
        String(ex.year) === bulkForm.year
      ) as any;
      let examId = existingExam?.id;
      if (!examId) {
        const newExam = {
          id: uuidv4(),
          name: `${bulkForm.examType} - Term ${bulkForm.term} ${bulkForm.year}`,
          term: bulkForm.term,
          year: parseInt(bulkForm.year),
          examType: bulkForm.examType,
          createdAt: now,
        };
        const res = await dataService.create(id, 'exams', newExam as any);
        examId = res.record?.id || newExam.id;
      }
      const student = allStudents.find(s => s.id === bulkForm.studentId);
      const maxScore = parseFloat(bulkForm.maxScore) || 100;
      let saved = 0;
      for (const [subjectId, scoreStr] of entries) {
        const score = parseFloat(scoreStr);
        if (isNaN(score)) continue;
        const sub = (subjects as any[]).find(s => s.id === subjectId);
        const pct = Math.round((score / maxScore) * 100);
        const gradeInfo = getGrade(pct);
        // Check if result already exists for this student/exam/subject
        const existing = (examResults as any[]).find(r =>
          r.studentId === bulkForm.studentId && r.examId === examId && r.subjectId === subjectId
        );
        if (existing) {
          await dataService.update(id, 'examResults', existing.id, {
            ...existing, score, maxScore, grade: gradeInfo.grade, remarks: gradeInfo.remark, updatedAt: now,
          } as any);
        } else {
          await dataService.create(id, 'examResults', {
            id: uuidv4(), examId,
            studentId: bulkForm.studentId,
            subjectId,
            subjectName: sub?.name,
            studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
            classId: bulkForm.classId,
            score, maxScore,
            grade: gradeInfo.grade,
            remarks: gradeInfo.remark,
            examType: bulkForm.examType,
            createdAt: now,
          } as any);
        }
        saved++;
      }
      addToast(`Saved ${saved} subject score${saved !== 1 ? 's' : ''} for ${student?.firstName}`, 'success');
      setBulkScores({});
      setBulkForm(p => ({ ...p, studentId: '' }));
      setShowForm(false);
      // Keep the class expanded so user sees the updated grades immediately
      if (bulkForm.classId) {
        setExpandedClasses(prev => { const n = new Set(prev); n.add(bulkForm.classId); return n; });
      }
    } catch { addToast('Failed to save grades', 'error'); }
    finally { setBulkSubmitting(false); }
  }

  async function handleDelete(idResult: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    const ok = await confirm({ title: 'Delete Grade', description: 'Remove this grade entry?', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await dataService.delete(id, 'examResults', idResult);
      addToast('Grade deleted', 'success');
    } catch (error) {
      addToast('Failed to delete grade', 'error');
    }
  }

  async function handleEditSave() {
    if (!editGrade) return;
    const id = schoolId || user?.id;
    if (!id) return;
    const score = parseFloat(editGrade.score);
    const maxScore = parseFloat(editGrade.maxScore);
    if (isNaN(score) || isNaN(maxScore) || maxScore <= 0) { addToast('Enter valid score and max score', 'error'); return; }
    const pct = Math.round((score / maxScore) * 100);
    const gradeInfo = getGrade(pct);
    setIsSavingEdit(true);
    try {
      await dataService.update(id, 'examResults', editGrade.id, {
        score, maxScore, grade: gradeInfo.grade, remarks: gradeInfo.remark, updatedAt: new Date().toISOString(),
      } as any);
      addToast('Grade updated', 'success');
      setEditGrade(null);
    } catch { addToast('Failed to update grade', 'error'); }
    finally { setIsSavingEdit(false); }
  }

  // Get unique students who have grades
  const studentsWithGrades = useMemo(() => {
    const studentIds = new Set(grades.map(g => g.studentId));
    return students.filter(s => studentIds.has(s.id));
  }, [grades, students]);

  async function handleCreateExamFeeInvoice() {
    const id = schoolId || user?.id;
    if (!id) return;
    const amount = parseFloat(invoiceAmount);
    if (isNaN(amount) || amount <= 0) { addToast('Please enter a valid amount', 'error'); return; }
    if (studentsWithGrades.length === 0) { addToast('No students with grades to invoice', 'error'); return; }
    setIsCreatingInvoice(true);
    try {
      const now = new Date().toISOString();
      const year = new Date().getFullYear().toString();
      let count = 0;
      for (const student of studentsWithGrades) {
        await dataService.create(id, 'fees', { id: uuidv4(), studentId: student.id, description: invoiceDescription, amount, term: invoiceTerm, year, createdAt: now } as any);
        count++;
      }
      window.dispatchEvent(new CustomEvent('feesUpdated'));
      addToast(`Created exam fee invoices for ${count} students`, 'success');
      setShowInvoiceModal(false);
      setInvoiceAmount('');
      setInvoiceDescription('Examination Fee');
    } catch (error) {
      addToast('Failed to create exam fee invoices', 'error');
    } finally {
      setIsCreatingInvoice(false);
    }
  }

  function handleExportCSV() {
    exportToCSV(grades, 'grades', [
      { key: 'studentName' as keyof StudentGrade, label: 'Student' },
      { key: 'subjectName' as keyof StudentGrade, label: 'Subject' },
      { key: 'score' as keyof StudentGrade, label: 'Score' },
      { key: 'maxScore' as keyof StudentGrade, label: 'Max Score' },
      { key: 'examType' as keyof StudentGrade, label: 'Exam Type' },
      { key: 'term' as keyof StudentGrade, label: 'Term' },
    ]);
    addToast('Exported to CSV', 'success');
  }

  function handleExportPDF() {
    const exportData = grades.map(g => ({
      ...g,
      percentage: Math.round((g.score / g.maxScore) * 100),
      grade: getGrade(Math.round((g.score / g.maxScore) * 100)).grade,
    }));
    exportToPDF('Grades Report', exportData, [
      { key: 'studentName', label: 'Student' },
      { key: 'subjectName', label: 'Subject' },
      { key: 'score', label: 'Score' },
      { key: 'percentage', label: '%' },
      { key: 'grade', label: 'Grade' },
    ], 'grades');
    addToast('Exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    exportToExcel(grades, 'grades', [
      { key: 'studentName' as keyof StudentGrade, label: 'Student' },
      { key: 'subjectName' as keyof StudentGrade, label: 'Subject' },
      { key: 'score' as keyof StudentGrade, label: 'Score' },
      { key: 'maxScore' as keyof StudentGrade, label: 'Max Score' },
      { key: 'examType' as keyof StudentGrade, label: 'Exam Type' },
      { key: 'term' as keyof StudentGrade, label: 'Term' },
    ]);
    addToast('Exported to Excel', 'success');
    setShowExportMenu(false);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (classFilterRef.current && !classFilterRef.current.contains(event.target as Node)) {
        setShowClassFilter(false);
      }
      if (termFilterRef.current && !termFilterRef.current.contains(event.target as Node)) {
        setShowTermFilter(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Smart template state - class/student selection before download
  const [templateClassId, setTemplateClassId] = useState('');
  const [templateStudentIds, setTemplateStudentIds] = useState<Set<string>>(new Set());
  const [templateStep, setTemplateStep] = useState<'select' | 'ready'>('select');
  // Exam config for import
  const [importExamType, setImportExamType] = useState('Mid-Term');
  const [importTerm, setImportTerm] = useState(() => {
    try { const r = localStorage.getItem(`schofy_settings_${schoolId || ''}`); if (r) return JSON.parse(r).currentTerm || '1'; } catch {}
    return '1';
  });
  const [importYear, setImportYear] = useState(new Date().getFullYear().toString());

  const studentsForTemplateClass = useMemo(() => {
    if (!templateClassId) return [];
    return [...activeStudents]
      .filter(s => s.classId === templateClassId)
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [templateClassId, activeStudents]);

  const subjectsForTemplateClass = useMemo(() => {
    if (!templateClassId) return [];
    return (subjects as any[]).filter(s => s.classId === templateClassId);
  }, [templateClassId, subjects]);

  function downloadSmartTemplate() {
    const classStudents = studentsForTemplateClass.filter(s =>
      templateStudentIds.size === 0 || templateStudentIds.has(s.id)
    );
    const classSubjects = subjectsForTemplateClass;
    if (classStudents.length === 0) { addToast('No students found for selected class', 'error'); return; }
    if (classSubjects.length === 0) { addToast('No subjects found for selected class. Add subjects first.', 'error'); return; }

    import('xlsx').then((XLSX) => {
      const subjectHeaders = classSubjects.map((s: any) => `${s.name}${s.code ? ` (${s.code})` : ''}`);
      const headers = ['Student Name', 'Student ID', ...subjectHeaders];
      const rows = classStudents.map(s => [
        `${s.firstName} ${s.lastName}`,
        s.studentId || s.admissionNo || s.id,
        ...classSubjects.map(() => ''),
      ]);
      const wsData = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = headers.map((h, i) => ({ wch: i < 2 ? 22 : Math.max(h.length + 2, 10) }));
      const wb = XLSX.utils.book_new();
      const cls = (allClassesData as any[]).find(c => c.id === templateClassId);
      XLSX.utils.book_append_sheet(wb, ws, cls?.name || 'Grades');
      XLSX.writeFile(wb, `grades-template-${cls?.name || 'class'}.xlsx`);
      addToast(`Template downloaded for ${classStudents.length} students, ${classSubjects.length} subjects`, 'success');
    });
  }

  function downloadTemplate() {
    // Legacy fallback - open smart template selector instead
    setTemplateStep('select');
    setTemplateClassId('');
    setTemplateStudentIds(new Set());
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep('upload');
    setTemplateStep('select');
    setTemplateClassId('');
    setTemplateStudentIds(new Set());
    setCsvHeaders([]);
    setCsvData([]);
    setFieldMapping({});
    setImportPreview([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      if (isExcel) {
        const { read, utils } = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = read(buffer);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 2) { addToast('Excel file must have headers and at least one data row', 'error'); return; }
        const headers = rows[0].map((h: any) => String(h ?? ''));
        const data = rows.slice(1).map((row: any[]) => headers.map((_: any, i: number) => String(row[i] ?? '')));
        setCsvHeaders(headers);
        setCsvData(data);
        setImportStep('map');
        setShowImportModal(true);
      } else {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) { addToast('File must have headers and at least one data row', 'error'); return; }
        const headers = parseCSVLine(lines[0]);
        const data = lines.slice(1).map(line => parseCSVLine(line));
        setCsvHeaders(headers);
        setCsvData(data);
        setImportStep('map');
        setShowImportModal(true);
      }
    } catch (error) { addToast('Failed to read file', 'error'); }
    event.target.value = '';
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += char;
    }
    result.push(current.trim());
    return result;
  }

  function processMapping() {
    // Smart template: "Student Name", "Student ID", "Subject1", "Subject2", ...
    const isSmartTemplate = csvHeaders.length >= 3 &&
      csvHeaders[0].toLowerCase().replace(/"/g, '').includes('student') &&
      csvHeaders[1].toLowerCase().replace(/"/g, '').includes('id');

    if (isSmartTemplate) {
      const subjectCols = csvHeaders.slice(2);
      const mappedData: Partial<ExamResult>[] = [];

      for (const row of csvData) {
        const studentIdVal = row[1]?.replace(/"/g, '').trim();
        const studentNameVal = row[0]?.replace(/"/g, '').trim();
        if (!studentIdVal && !studentNameVal) continue;

        const student = allStudents.find(s =>
          s.studentId === studentIdVal ||
          s.admissionNo === studentIdVal ||
          `${s.firstName} ${s.lastName}`.toLowerCase() === studentNameVal?.toLowerCase()
        );
        if (!student) continue;

        for (let i = 0; i < subjectCols.length; i++) {
          const scoreStr = row[i + 2]?.replace(/"/g, '').trim();
          if (!scoreStr) continue;
          const score = parseFloat(scoreStr);
          if (isNaN(score)) continue;

          const colName = subjectCols[i].replace(/"/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
          const subject = (subjects as any[]).find(s =>
            s.classId === student.classId &&
            s.name.toLowerCase() === colName.toLowerCase()
          );
          if (!subject) continue;

          mappedData.push({ studentId: student.id, subjectId: subject.id, score, maxScore: 100 } as any);
        }
      }

      if (mappedData.length === 0) {
        addToast('No matching students or subjects found. Check the CSV matches your class data.', 'error');
        return;
      }
      setImportPreview(mappedData);
      setImportStep('preview');
      return;
    }

    // Legacy format: studentId, subjectId, score, maxScore
    const legacyData: Partial<ExamResult>[] = [];
    for (const row of csvData) {
      const grade: Partial<ExamResult> = {};
      gradeExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            if (field.key === 'score' || field.key === 'maxScore') {
              (grade as any)[field.key] = parseFloat(row[headerIndex]) || 0;
            } else {
              (grade as any)[field.key] = row[headerIndex];
            }
          }
        }
      });
      if (grade.studentId && grade.subjectId) legacyData.push(grade);
    }
    setImportPreview(legacyData);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (importPreview.length === 0) { addToast('No valid grades to import', 'error'); return; }
    if (!id) return;
    setIsImportingGrades(true);
    try {
      const now = new Date().toISOString();

      // Find or create the exam for this import
      let exam = (examsData as any[]).find(ex =>
        ex.examType === importExamType &&
        String(ex.term) === importTerm &&
        String(ex.year) === importYear
      );
      let examId = exam?.id;
      if (!examId) {
        const newExam = {
          id: uuidv4(),
          name: `${importExamType} - Term ${importTerm} ${importYear}`,
          term: importTerm,
          year: parseInt(importYear),
          examType: importExamType,
          createdAt: now,
        };
        const res = await dataService.create(id, 'exams', newExam as any);
        examId = res.record?.id || newExam.id;
      }

      let successCount = 0;
      for (const data of importPreview) {
        const student = allStudents.find(s => s.id === (data as any).studentId);
        const subject = (subjects as any[]).find(s => s.id === (data as any).subjectId);
        const score = (data as any).score as number;
        const maxScore = (data as any).maxScore as number || 100;
        const pct = Math.round((score / maxScore) * 100);
        const gradeInfo = getGrade(pct);

        // Check if result already exists for this student/exam/subject - update if so
        const existing = (examResults as any[]).find(r =>
          r.studentId === (data as any).studentId &&
          r.examId === examId &&
          r.subjectId === (data as any).subjectId
        );

        if (existing) {
          await dataService.update(id, 'examResults', existing.id, {
            ...existing, score, maxScore, grade: gradeInfo.grade, remarks: gradeInfo.remark, updatedAt: now,
          } as any);
        } else {
          await dataService.create(id, 'examResults', {
            id: uuidv4(),
            examId,
            studentId: (data as any).studentId,
            subjectId: (data as any).subjectId,
            subjectName: subject?.name,
            studentName: student ? `${student.firstName} ${student.lastName}` : undefined,
            classId: student?.classId,
            score,
            maxScore,
            grade: gradeInfo.grade,
            remarks: gradeInfo.remark,
            examType: importExamType,
            createdAt: now,
          } as any);
        }
        successCount++;
      }
      addToast(`Imported ${successCount} grade${successCount !== 1 ? 's' : ''} for ${importExamType} Term ${importTerm} ${importYear}`, 'success');
      closeImportModal();
    } catch (error) { addToast('Failed to import grades', 'error'); }
    finally { setIsImportingGrades(false); }
  }

  const filteredGrades = grades.filter(g => {
    if (filterTerm !== 'all' && g.term !== filterTerm) return false;
    if (filterClass !== 'all') {
      const student = allStudents.find(s => s.id === g.studentId);
      if (student?.classId !== filterClass) return false;
    }
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return g.studentName.toLowerCase().includes(search) || g.subjectName.toLowerCase().includes(search);
    }
    return true;
  });

  const studentStats = students.map(student => {
    const studentGrades = grades.filter(g => g.studentId === student.id);
    const avgScore = studentGrades.length > 0
      ? studentGrades.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) / studentGrades.length
      : 0;
    const gradeInfo = getGrade(avgScore);
    return {
      ...student,
      studentName: `${student.firstName} ${student.lastName}`,
      avgScore: Math.round(avgScore),
      grade: gradeInfo.grade,
      subjectsCount: new Set(studentGrades.map(g => g.subjectId)).size,
    };
  }).filter(s => s.subjectsCount > 0);

  // Expanded class accordion state
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  function toggleClass(classId: string) {
    setExpandedClasses(prev => { const n = new Set(prev); n.has(classId) ? n.delete(classId) : n.add(classId); return n; });
  }

  // Group filtered grades by class
  const classesSorted = useMemo(() =>
    [...allClassesData].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0)) as any[],
    [allClassesData]
  );

  const gradesByClass = useMemo(() => {
    return classesSorted.map(cls => {
      const classGrades = filteredGrades.filter(g => {
        const student = allStudents.find(s => s.id === g.studentId);
        return student?.classId === cls.id;
      });
      if (classGrades.length === 0) return null;

      // Group by student
      const studentMap = new Map<string, { studentName: string; grades: StudentGrade[] }>();
      for (const g of classGrades) {
        if (!studentMap.has(g.studentId)) {
          studentMap.set(g.studentId, { studentName: g.studentName, grades: [] });
        }
        studentMap.get(g.studentId)!.grades.push(g);
      }

      const studentList = Array.from(studentMap.entries()).map(([studentId, { studentName, grades: sg }]) => {
        const avg = sg.length > 0 ? Math.round(sg.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / sg.length) : 0;
        return { studentId, studentName, grades: sg, avg, grade: getGrade(avg) };
      }).sort((a, b) => a.studentName.localeCompare(b.studentName));

      const uniqueSubjects = [...new Map(classGrades.map(g => [g.subjectId || g.subjectName, { id: g.subjectId, name: g.subjectName, code: (subjects as any[]).find(s => s.id === g.subjectId)?.code || '' }])).values()];

      return { cls, studentList, uniqueSubjects, totalGrades: classGrades.length };
    }).filter(Boolean) as { cls: any; studentList: any[]; uniqueSubjects: any[]; totalGrades: number }[];
  }, [classesSorted, filteredGrades, allStudents, subjects]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Student Grades
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage and track student performance (Secondary School only)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)} 
              className="btn btn-secondary"
              title="Export"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText size={14} />
                  Export PDF
                </button>
                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText size={14} />
                  Export Excel
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { setShowImportModal(true); setImportStep('upload'); setTemplateStep('select'); }} className="btn btn-secondary" title="Import CSV">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />
          <button 
            onClick={() => {
              if (studentsWithGrades.length === 0) {
                addToast('No students with grades to invoice', 'warning');
                return;
              }
              setShowInvoiceModal(true);
            }} 
            className="btn btn-secondary text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            title="Invoice Exam Fees"
          >
            <FileText size={16} />
            <span className="hidden sm:inline">Invoice ({studentsWithGrades.length})</span>
          </button>
          <button onClick={() => navigate('/exam-marks')} className="btn btn-secondary flex items-center gap-2">
            <BarChart3 size={16} /> Exam Marks
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary shadow-lg shadow-primary-500/25">
            <Plus size={16} /> Add Grade
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-solid-indigo p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-blue text-white">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Total Grades</p>
              <p className="text-2xl font-bold text-white">
                {grades.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-emerald p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-green text-white">
              <Award size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Avg Score</p>
              <p className="text-2xl font-bold text-white">
                {grades.length > 0 ? Math.round(grades.reduce((sum, g) => sum + (g.score / g.maxScore) * 100, 0) / grades.length) : 0}%
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-violet p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-violet text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Graded Students</p>
              <p className="text-2xl font-bold text-white">
                {new Set(grades.map(g => g.studentId)).size}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-rose p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-amber text-white">
              <BarChart3 size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Top Student</p>
              <p className="text-lg font-bold text-white truncate">
                {studentStats.sort((a, b) => b.avgScore - a.avgScore)[0]?.studentName || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 min-w-0 w-full">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search student or subject..."
                className="search-input"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Class Filter Dropdown */}
              <div className="relative" ref={classFilterRef}>
                <button
                  onClick={() => { setShowClassFilter(!showClassFilter); setShowTermFilter(false); }}
                  className={`btn btn-secondary flex items-center gap-2 ${filterClass !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">
                    {filterClass === 'all' ? 'All Classes' : (allClassesData.find((c: any) => c.id === filterClass) as any)?.name || filterClass}
                  </span>
                  <span className="sm:hidden">Class</span>
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showClassFilter ? 'rotate-180' : ''}`} />
                </button>
                {showClassFilter && (
                  <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-dropdown-in max-h-64 overflow-y-auto">
                    <div className="py-1">
                      <button
                        onClick={() => { setFilterClass('all'); setShowClassFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${filterClass === 'all' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                      >
                        All Classes
                        {filterClass === 'all' && <Check size={14} className="ml-auto" />}
                      </button>
                      {[...allClassesData].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0)).map((cls: any) => (
                        <button key={cls.id}
                          onClick={() => { setFilterClass(cls.id); setShowClassFilter(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${filterClass === cls.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                          {cls.name}
                          {filterClass === cls.id && <Check size={14} className="ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Term Filter Dropdown */}
              <div className="relative" ref={termFilterRef}>
                <button
                  onClick={() => { setShowTermFilter(!showTermFilter); setShowClassFilter(false); }}
                  className={`btn btn-secondary flex items-center gap-2 ${filterTerm !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
                >
                  <span className="hidden sm:inline">
                    {filterTerm === 'all' ? 'All Terms' : `Term ${filterTerm}`}
                  </span>
                  <span className="sm:hidden">Terms</span>
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showTermFilter ? 'rotate-180' : ''}`} />
                </button>
                {showTermFilter && (
                  <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-dropdown-in">
                    <div className="py-1">
                      <button
                        onClick={() => { setFilterTerm('all'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === 'all' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        All Terms
                        {filterTerm === 'all' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterTerm('1'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === '1' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        Term 1
                        {filterTerm === '1' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterTerm('2'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === '2' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        Term 2
                        {filterTerm === '2' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterTerm('3'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === '3' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        Term 3
                        {filterTerm === '3' && <Check size={14} className="ml-auto" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Class-grouped accordion */}
      <div className="space-y-3">
        {gradesByClass.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Award size={32} className="text-violet-400" />
              </div>
              <p className="text-slate-500 font-medium">No grades recorded</p>
              <p className="text-slate-400 text-sm">Add grades using the "Add Grade" button above</p>
              <button onClick={() => setShowForm(true)} className="btn btn-primary mt-1"><Plus size={15} /> Add Grade</button>
            </div>
          </div>
        ) : gradesByClass.map(({ cls, studentList, uniqueSubjects, totalGrades }) => {
          const isOpen = expandedClasses.has(cls.id);
          const gradeColors: Record<string, string> = {
            D1: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
            D2: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
            C3: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
            C4: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
            C5: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
            C6: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
            P7: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
            P8: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
            F9: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
          };

          return (
            <div key={cls.id} className="card overflow-hidden">
              {/* Class header - click to expand */}
              <button
                onClick={() => toggleClass(cls.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform ${isOpen ? 'rotate-0' : ''}`}
                  style={{ backgroundColor: 'var(--primary-color)' }}>
                  <BookOpen size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-800 dark:text-white">{cls.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {studentList.length} student{studentList.length !== 1 ? 's' : ''} - {uniqueSubjects.length} subject{uniqueSubjects.length !== 1 ? 's' : ''} - {totalGrades} grade{totalGrades !== 1 ? 's' : ''}
                  </p>
                </div>
                <ChevronRight size={18} className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
              </button>

              {/* Expanded: student - subject table */}
              {isOpen && (
                <div className="border-t border-slate-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse" style={{ minWidth: `${Math.max(500, (uniqueSubjects.length + 3) * 100)}px` }}>
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-700/60">
                          <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Student</th>
                          {uniqueSubjects.map(sub => (
                            <th key={sub.id || sub.name} className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs">
                              {sub.name}
                              {sub.code && <div className="font-normal text-[10px] text-slate-400">{sub.code}</div>}
                            </th>
                          ))}
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300">Avg%</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentList.map((student, si) => (
                          <tr key={student.studentId}
                            className={si % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/50'}>
                            <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-white whitespace-nowrap">
                              {student.studentName}
                            </td>
                            {uniqueSubjects.map(sub => {
                              const g = student.grades.find((gr: StudentGrade) =>
                                sub.id ? gr.subjectId === sub.id : gr.subjectName === sub.name
                              );
                              if (!g) return (
                                <td key={sub.id || sub.name} className="px-3 py-2.5 text-center text-slate-300 dark:text-slate-600">-</td>
                              );
                              const pct = Math.round((g.score / g.maxScore) * 100);
                              const gi = getGrade(pct);
                              return (
                                <td key={sub.id || sub.name} className="px-3 py-2.5 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="font-semibold text-slate-700 dark:text-slate-200">{g.score}/{g.maxScore}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${gradeColors[gi.grade] || 'bg-slate-100 text-slate-600'}`}>{gi.grade}</span>
                                    <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => setEditGrade({ id: g.id, studentName: student.studentName, subjectName: sub.name, score: String(g.score), maxScore: String(g.maxScore) })}
                                        className="text-indigo-400 hover:text-indigo-600" title="Edit">
                                        <Pencil size={11} />
                                      </button>
                                      <button onClick={() => handleDelete(g.id)} className="text-red-400 hover:text-red-600" title="Delete">
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-200">
                              {student.avg}%
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${gradeColors[student.grade.grade] || 'bg-slate-100 text-slate-700'}`}>
                                {student.grade.grade}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Award size={18} className="text-white" />
                <h2 className="font-bold text-white">Add Grades - All Subjects</h2>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>
            <form onSubmit={handleBulkSubmit} className="flex flex-col overflow-hidden">
              {/* Top controls */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
                <div>
                  <label className="form-label">Class *</label>
                  <select value={bulkForm.classId}
                    onChange={e => { setBulkForm(p => ({ ...p, classId: e.target.value, studentId: '' })); setBulkScores({}); }}
                    className="form-input" required>
                    <option value="">- Select Class -</option>
                    {[...allClassesData].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0)).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Student *</label>
                  <select value={bulkForm.studentId} onChange={e => handleBulkStudentChange(e.target.value)}
                    className="form-input" required disabled={!bulkForm.classId}>
                    <option value="">- Select Student -</option>
                    {studentsForBulkClass.map(s => (
                      <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Exam Type</label>
                  <select value={bulkForm.examType} onChange={e => setBulkForm(p => ({ ...p, examType: e.target.value }))} className="form-input">
                    <option value="Mid-Term">Mid-Term</option>
                    <option value="End-Term">End-Term</option>
                    <option value="CAT">CAT</option>
                    <option value="Final">Final Exam</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Term</label>
                  <select value={bulkForm.term} onChange={e => setBulkForm(p => ({ ...p, term: e.target.value }))} className="form-input">
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Year</label>
                  <input type="number" value={bulkForm.year} onChange={e => setBulkForm(p => ({ ...p, year: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Max Score</label>
                  <input type="number" value={bulkForm.maxScore} onChange={e => setBulkForm(p => ({ ...p, maxScore: e.target.value }))} className="form-input" min="1" />
                </div>
              </div>

              {/* Subject score rows */}
              <div className="flex-1 overflow-y-auto">
                {!bulkForm.classId ? (
                  <div className="p-8 text-center text-slate-400 text-sm">Select a class to see subjects</div>
                ) : subjectsForBulkClass.length === 0 ? (
                  <div className="p-8 text-center text-amber-600 text-sm">No subjects found for this class. Add subjects first.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700/80 z-10">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Subject</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 w-20">Code</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 w-28">Score / {bulkForm.maxScore}</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-300 w-20">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {subjectsForBulkClass.map((sub: any, i: number) => {
                        const scoreStr = bulkScores[sub.id] ?? '';
                        const score = parseFloat(scoreStr);
                        const max = parseFloat(bulkForm.maxScore) || 100;
                        const pct = !isNaN(score) && scoreStr !== '' ? Math.round((score / max) * 100) : null;
                        const grade = pct !== null ? getGrade(pct) : null;
                        const gradeClass = grade?.grade.startsWith('D') ? 'text-emerald-600 font-bold' :
                          grade?.grade.startsWith('C') ? 'text-blue-600 font-semibold' :
                          grade?.grade.startsWith('P') ? 'text-amber-600' :
                          grade ? 'text-red-600 font-bold' : 'text-slate-400';
                        return (
                          <tr key={sub.id} className={i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}>
                            <td className="px-4 py-2 font-medium text-slate-800 dark:text-white">{sub.name}</td>
                            <td className="px-3 py-2 text-center font-mono text-xs text-slate-500">{sub.code || '-'}</td>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="number"
                                value={scoreStr}
                                onChange={e => setBulkScores(p => ({ ...p, [sub.id]: e.target.value }))}
                                className="w-20 text-center form-input py-1 text-sm"
                                min="0"
                                max={bulkForm.maxScore}
                                placeholder="-"
                                disabled={!bulkForm.studentId}
                              />
                            </td>
                            <td className={`px-3 py-2 text-center text-sm ${gradeClass}`}>
                              {grade ? `${grade.grade}` : '-'}
                              {pct !== null && <div className="text-[10px] text-slate-400 font-normal">{pct}%</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-800/50">
                <p className="text-xs text-slate-500">
                  {Object.values(bulkScores).filter(v => v.trim() !== '').length} of {subjectsForBulkClass.length} subjects filled
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={bulkSubmitting || !bulkForm.studentId} className="btn btn-primary disabled:opacity-50">
                    {bulkSubmitting ? 'Saving...' : 'Save Grades'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInvoiceModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowInvoiceModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-white" />
                <h2 className="font-bold text-white">Invoice Exam Fees</h2>
              </div>
              <button onClick={() => setShowInvoiceModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Creating exam fee invoices for <strong>{studentsWithGrades.length}</strong> students
                </p>
              </div>
              <div>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  value={invoiceDescription}
                  onChange={(e) => setInvoiceDescription(e.target.value)}
                  className="form-input"
                  placeholder="e.g., Examination Fee"
                />
              </div>
              <div>
                <label className="form-label">Amount per Student</label>
                <input
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="form-input"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="form-label">Term</label>
                <select
                  value={invoiceTerm}
                  onChange={(e) => setInvoiceTerm(e.target.value)}
                  className="form-input"
                >
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowInvoiceModal(false)} className="btn btn-secondary" disabled={isCreatingInvoice}>Cancel</button>
                <button onClick={handleCreateExamFeeInvoice} disabled={isCreatingInvoice} className="btn btn-primary flex items-center gap-2 disabled:opacity-70">
                  {isCreatingInvoice ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating...</> : 'Create Invoices'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Grade Modal */}
      {editGrade && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setEditGrade(null); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Pencil size={16} className="text-white" />
                <h2 className="font-bold text-white">Edit Grade</h2>
              </div>
              <button onClick={() => setEditGrade(null)} className="p-1 hover:bg-white/20 rounded-lg"><X size={18} className="text-white" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-sm">
                <p className="font-medium text-slate-700 dark:text-slate-200">{editGrade.studentName}</p>
                <p className="text-slate-500 text-xs mt-0.5">{editGrade.subjectName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Score *</label>
                  <input type="number" value={editGrade.score}
                    onChange={e => setEditGrade(p => p ? { ...p, score: e.target.value } : null)}
                    className="form-input" min="0" autoFocus />
                </div>
                <div>
                  <label className="form-label">Max Score</label>
                  <input type="number" value={editGrade.maxScore}
                    onChange={e => setEditGrade(p => p ? { ...p, maxScore: e.target.value } : null)}
                    className="form-input" min="1" />
                </div>
              </div>
              {editGrade.score && editGrade.maxScore && parseFloat(editGrade.maxScore) > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg flex items-center gap-3">
                  {(() => {
                    const pct = Math.round((parseFloat(editGrade.score) / parseFloat(editGrade.maxScore)) * 100);
                    const gi = getGrade(pct);
                    const cls = gi.grade.startsWith('D') ? 'bg-emerald-100 text-emerald-700' : gi.grade.startsWith('C') ? 'bg-blue-100 text-blue-700' : gi.grade.startsWith('P') ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                    return <><span className="text-xl font-bold text-slate-700 dark:text-slate-200">{pct}%</span><span className={`px-2 py-0.5 rounded font-bold text-sm ${cls}`}>{gi.grade}</span><span className="text-sm text-slate-500">{gi.remark}</span></>;
                  })()}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setEditGrade(null)} className="btn btn-secondary" disabled={isSavingEdit}>Cancel</button>
                <button onClick={handleEditSave} disabled={isSavingEdit} className="btn btn-primary flex items-center gap-2 disabled:opacity-70">
                  {isSavingEdit ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</> : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-lg animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Grades</h2>
              </div>
              <button onClick={closeImportModal} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(85vh-56px)] space-y-4">

              {/* Step indicator */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {[
                  { n: 1, label: 'Select & Download' },
                  { n: 2, label: 'Upload CSV' },
                  { n: 3, label: 'Preview' },
                ].map((s, i) => {
                  const stepNum = importStep === 'upload' ? 1 : importStep === 'map' ? 2 : 3;
                  const done = stepNum > s.n;
                  const active = stepNum === s.n;
                  return (
                    <div key={s.n} className="flex items-center gap-1.5">
                      {i > 0 && <ArrowRight size={10} className="text-slate-300" />}
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                        {done ? '?' : s.n} {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* -- Step 1: Select class + students, download template -- */}
              {importStep === 'upload' && (
                <div className="space-y-4">
                  {/* Class selector */}
                  <div>
                    <label className="form-label">Select Class *</label>
                    <select
                      value={templateClassId}
                      onChange={e => { setTemplateClassId(e.target.value); setTemplateStudentIds(new Set()); }}
                      className="form-input"
                    >
                      <option value="">- Choose a class -</option>
                      {[...allClassesData].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0)).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Exam config */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="form-label">Exam Type</label>
                      <select value={importExamType} onChange={e => setImportExamType(e.target.value)} className="form-input">
                        <option value="Mid-Term">Mid-Term</option>
                        <option value="End-Term">End-Term</option>
                        <option value="CAT">CAT</option>
                        <option value="Final">Final Exam</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Term</label>
                      <select value={importTerm} onChange={e => setImportTerm(e.target.value)} className="form-input">
                        <option value="1">Term 1</option>
                        <option value="2">Term 2</option>
                        <option value="3">Term 3</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Year</label>
                      <input type="number" value={importYear} onChange={e => setImportYear(e.target.value)} className="form-input" />
                    </div>
                  </div>

                  {/* Student selector */}
                  {templateClassId && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="form-label mb-0">Select Students</label>
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setTemplateStudentIds(new Set(studentsForTemplateClass.map(s => s.id)))}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            All ({studentsForTemplateClass.length})
                          </button>
                          <span className="text-slate-300">-</span>
                          <button
                            type="button"
                            onClick={() => setTemplateStudentIds(new Set())}
                            className="text-slate-500 hover:underline"
                          >
                            None
                          </button>
                        </div>
                      </div>
                      {studentsForTemplateClass.length === 0 ? (
                        <p className="text-sm text-amber-600 dark:text-amber-400 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          No active students in this class.
                        </p>
                      ) : (
                        <div className="max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-700">
                          {studentsForTemplateClass.map(s => {
                            const sel = templateStudentIds.size === 0 || templateStudentIds.has(s.id);
                            return (
                              <label key={s.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <input
                                  type="checkbox"
                                  checked={sel}
                                  onChange={() => {
                                    const next = new Set(
                                      templateStudentIds.size === 0
                                        ? studentsForTemplateClass.map(x => x.id)
                                        : templateStudentIds
                                    );
                                    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                                    setTemplateStudentIds(next);
                                  }}
                                  className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-200 flex-1">{s.firstName} {s.lastName}</span>
                                <span className="text-xs text-slate-400 font-mono">{s.studentId || s.admissionNo}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {subjectsForTemplateClass.length > 0 && (
                        <p className="text-xs text-slate-500 mt-1.5">
                          Template will include {subjectsForTemplateClass.length} subject{subjectsForTemplateClass.length !== 1 ? 's' : ''}: {subjectsForTemplateClass.map((s: any) => s.name).join(', ')}
                        </p>
                      )}
                      {subjectsForTemplateClass.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1.5">No subjects found for this class. Add subjects first.</p>
                      )}
                    </div>
                  )}

                  {/* Download button */}
                  {templateClassId && studentsForTemplateClass.length > 0 && subjectsForTemplateClass.length > 0 && (
                    <button
                      onClick={downloadSmartTemplate}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <Download size={16} />
                      Download Excel Template ({templateStudentIds.size > 0 ? templateStudentIds.size : studentsForTemplateClass.length} students - {subjectsForTemplateClass.length} subjects)
                    </button>
                  )}

                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <p className="text-xs text-slate-500 mb-3">After filling in the scores, upload the CSV:</p>
                    <div
                      className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-5 hover:border-indigo-400 transition-colors cursor-pointer text-center"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={24} className="mx-auto text-slate-400 mb-2" />
                      <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload filled Excel (.xlsx)</p>
                      <p className="text-xs text-slate-400 mt-1">Supports .xlsx (recommended) or .csv</p>
                    </div>
                  </div>
                </div>
              )}

              {/* -- Step 2: Map (auto-mapped for smart template) -- */}
              {importStep === 'map' && (
                <div className="space-y-3">
                  {/* Show all file columns with mapping */}
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {csvHeaders.length} column{csvHeaders.length !== 1 ? 's' : ''} found in file. Map each to a grade field:
                  </p>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">File Column</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Sample Value</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Maps To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {csvHeaders.map((header, idx) => {
                          const sample = csvData[0]?.[idx] || '';
                          const currentMapping = Object.entries(fieldMapping).find(([, v]) => v === header)?.[0] || '';
                          return (
                            <tr key={header} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}>
                              <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{header}</td>
                              <td className="px-3 py-2 text-slate-400 truncate max-w-[80px]">{sample}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={currentMapping}
                                  onChange={e => {
                                    const newKey = e.target.value;
                                    setFieldMapping(prev => {
                                      const next = { ...prev };
                                      // Remove old mapping for this header
                                      Object.keys(next).forEach(k => { if (next[k] === header) delete next[k]; });
                                      if (newKey) next[newKey] = header;
                                      return next;
                                    });
                                  }}
                                  className="w-full form-input py-1 px-2 text-xs"
                                >
                                  <option value="">- Skip -</option>
                                  {gradeExpectedFields.map(f => (
                                    <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Smart template hint */}
                  {csvHeaders.length >= 3 && csvHeaders[0].toLowerCase().includes('student') && csvHeaders[1].toLowerCase().includes('id') && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                        ? Smart template detected - {csvHeaders.length - 2} subject column{csvHeaders.length - 2 !== 1 ? 's' : ''} will be auto-mapped
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setImportStep('upload')} className="btn btn-secondary py-1.5 px-3 text-sm">Back</button>
                    <button onClick={processMapping} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
                      Preview <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* -- Step 3: Preview -- */}
              {importStep === 'preview' && (
                <div className="space-y-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 space-y-1">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                      ? {importPreview.length} grade entr{importPreview.length !== 1 ? 'ies' : 'y'} ready to import
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Exam: <strong>{importExamType}</strong> - Term <strong>{importTerm}</strong> - <strong>{importYear}</strong>
                    </p>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Student</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Subject</th>
                          <th className="px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">Score</th>
                          <th className="px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">%</th>
                          <th className="px-2 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">Grade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.map((g: any, i) => {
                          const student = allStudents.find(s => s.id === g.studentId);
                          const subject = (subjects as any[]).find(s => s.id === g.subjectId);
                          const score = g.score as number;
                          const maxScore = (g.maxScore as number) || 100;
                          const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
                          const gi = getGrade(pct);
                          const gradeColor = gi.grade.startsWith('D') ? 'text-emerald-600 font-bold' :
                            gi.grade.startsWith('C') ? 'text-blue-600 font-semibold' :
                            gi.grade.startsWith('P') ? 'text-amber-600' : 'text-red-600 font-bold';
                          return (
                            <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}>
                              <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                              <td className="px-2 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                                {student ? `${student.firstName} ${student.lastName}` : <span className="text-red-500">Not found</span>}
                              </td>
                              <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">
                                {subject?.name || <span className="text-red-500">Not found</span>}
                              </td>
                              <td className="px-2 py-1.5 text-center font-semibold">{score}/{maxScore}</td>
                              <td className="px-2 py-1.5 text-center">{pct}%</td>
                              <td className={`px-2 py-1.5 text-center ${gradeColor}`}>{gi.grade}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.some((g: any) => !allStudents.find(s => s.id === g.studentId) || !(subjects as any[]).find(s => s.id === g.subjectId)) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">? Some entries show "Not found" - they will be skipped during import.</p>
                  )}
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm" disabled={isImportingGrades}>Back</button>
                    <button onClick={executeImport} disabled={isImportingGrades} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-70">
                      {isImportingGrades ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing...</> : <><Check size={14} /> Import {importPreview.length}</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



