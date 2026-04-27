import { useEffect, useState, useRef, useMemo } from 'react';
import { Plus, Download, Trash2, Users, GraduationCap, Award, FileText, Search, BarChart3, ChevronDown, Upload, X, ArrowRight, Check, Filter } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { ExamResult } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useActiveStudents, useStudents } from '../contexts/StudentsContext';

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
  const [showForm, setShowForm] = useState(false);
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
  const [invoiceTerm, setInvoiceTerm] = useState('1');

  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [, setLoading] = useState(true);

  const activeStudents = useActiveStudents();
  const { students: allStudents } = useStudents();

  useEffect(() => {
    if (user?.id || schoolId) {
      loadData();
    }
  }, [user?.id, schoolId]);

  useEffect(() => {
    const refresh = () => loadData();
    window.addEventListener('dataRefresh', refresh);
    window.addEventListener('schofyDataRefresh', refresh);
    return () => {
      window.removeEventListener('dataRefresh', refresh);
      window.removeEventListener('schofyDataRefresh', refresh);
    };
  }, []);

  async function loadData() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const [results, subs] = await Promise.all([
        dataService.getAll(id, 'examResults'),
        dataService.getAll(id, 'subjects'),
      ]);
      setExamResults(results);
      setSubjects(subs);
    } catch (error) {
      console.error('Failed to load grades:', error);
    } finally {
      setLoading(false);
    }
  }

  const grades = useMemo(() => {
    if (!examResults || !allStudents || !subjects) return [];
    
    return examResults.map(g => {
      const student = allStudents.find(s => s.id === g.studentId);
      const subject = subjects.find(s => s.id === g.subjectId);
      return {
        ...g,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
        subjectName: subject ? subject.name : 'Unknown',
        term: '1',
        year: new Date().getFullYear().toString(),
        examType: 'Mid-Term',
      } as StudentGrade;
    });
  }, [examResults, allStudents, subjects]);

  const gradeExpectedFields = [
    { key: 'studentId', label: 'Student ID', required: true },
    { key: 'subjectId', label: 'Subject ID', required: true },
    { key: 'score', label: 'Score', required: true },
    { key: 'maxScore', label: 'Max Score', required: true },
  ];

  const [formData, setFormData] = useState({
    studentId: '',
    subjectId: '',
    score: '',
    maxScore: '100',
    term: '1',
    year: new Date().getFullYear().toString(),
    examType: 'Mid-Term',
  });

  const students = activeStudents.filter(s => s.classId?.startsWith('ss-'));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const newGrade: ExamResult = {
        id: uuidv4(),
        examId: uuidv4(),
        studentId: formData.studentId,
        subjectId: formData.subjectId,
        score: parseFloat(formData.score),
        maxScore: parseFloat(formData.maxScore),
        createdAt: new Date().toISOString(),
      };
      await dataService.create(id, 'examResults', newGrade as any);
      addToast('Grade added successfully', 'success');
      setShowForm(false);
      setFormData({
        studentId: '',
        subjectId: '',
        score: '',
        maxScore: '100',
        term: '1',
        year: new Date().getFullYear().toString(),
        examType: 'Mid-Term',
      });
      loadData();
    } catch (error) {
      addToast('Failed to add grade', 'error');
    }
  }

  async function handleDelete(idResult: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    if (!confirm('Delete this grade?')) return;
    try {
      await dataService.delete(id, 'examResults', idResult);
      loadData();
      addToast('Grade deleted successfully', 'success');
    } catch (error) {
      addToast('Failed to delete grade', 'error');
    }
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
    if (isNaN(amount) || amount <= 0) {
      addToast('Please enter a valid amount', 'error');
      return;
    }
    if (studentsWithGrades.length === 0) {
      addToast('No students with grades to invoice', 'error');
      return;
    }
    try {
      const now = new Date().toISOString();
      const year = new Date().getFullYear().toString();
      let count = 0;
      for (const student of studentsWithGrades) {
        const newFee = {
          id: uuidv4(),
          studentId: student.id,
          description: invoiceDescription,
          amount: amount,
          term: invoiceTerm,
          year: year,
          createdAt: now,
        };
        await dataService.create(id, 'fees', newFee as any);
        count++;
      }
      // Broadcast change to update other pages
      window.dispatchEvent(new CustomEvent('feesUpdated'));
      addToast(`Created exam fee invoices for ${count} students`, 'success');
      setShowInvoiceModal(false);
      setInvoiceAmount('');
      setInvoiceDescription('Examination Fee');
    } catch (error) {
      console.error('Failed to create exam fee invoices:', error);
      addToast('Failed to create exam fee invoices', 'error');
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

  function downloadTemplate() {
    const headers = gradeExpectedFields.map(f => f.label);
    const sampleRow = ['student-uuid-1', 'subject-uuid-1', '85', '100'];
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'grade-import-template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    addToast('Template downloaded', 'success');
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep('upload');
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
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) { addToast('CSV must have headers and at least one data row', 'error'); return; }
      const headers = parseCSVLine(lines[0]);
      const data = lines.slice(1).map(line => parseCSVLine(line));
      setCsvHeaders(headers);
      setCsvData(data);
      const autoMapping: Record<string, string> = {};
      gradeExpectedFields.forEach(field => {
        const matchingHeader = headers.find(h => h.toLowerCase() === field.label.toLowerCase() || h.toLowerCase().includes(field.key.toLowerCase()));
        if (matchingHeader) autoMapping[field.key] = matchingHeader;
      });
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) { addToast('Failed to read CSV file', 'error'); }
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
    const mappedData: Partial<ExamResult>[] = [];
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
      if (grade.studentId && grade.subjectId) mappedData.push(grade);
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (importPreview.length === 0) { addToast('No valid grades to import', 'error'); return; }
    if (!id) return;
    try {
      const now = new Date().toISOString();
      let successCount = 0;
      for (const data of importPreview) {
        const grade: ExamResult = {
          id: uuidv4(),
          examId: uuidv4(),
          studentId: (data.studentId as string) || '',
          subjectId: (data.subjectId as string) || '',
          score: (data.score as number) || 0,
          maxScore: (data.maxScore as number) || 100,
          createdAt: now,
        };
        await dataService.create(id, 'examResults', grade as any);
        successCount++;
      }
      addToast(`Successfully imported ${successCount} grades`, 'success');
      closeImportModal();
    } catch (error) { addToast('Failed to import grades', 'error'); }
  }

  const filteredGrades = grades.filter(g => {
    if (filterTerm !== 'all' && g.term !== filterTerm) return false;
    if (filterClass !== 'all') {
      const student = students.find(s => s.id === g.studentId);
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
          <button onClick={() => { setShowImportModal(true); fileInputRef.current?.click(); }} className="btn btn-secondary" title="Import CSV">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".csv"
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
            <div className="relative flex-1 w-full">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search student or subject..."
                className="search-input"
              />
            </div>
            <div className="flex items-center gap-2">
              {/* Class Filter Dropdown */}
              <div className="relative" ref={classFilterRef}>
                <button
                  onClick={() => { setShowClassFilter(!showClassFilter); setShowTermFilter(false); }}
                  className={`btn btn-secondary flex items-center gap-2 ${filterClass !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">
                    {filterClass === 'all' ? 'All Classes' : filterClass.toUpperCase().replace('-', ' ')}
                  </span>
                  <span className="sm:hidden">Class</span>
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showClassFilter ? 'rotate-180' : ''}`} />
                </button>
                {showClassFilter && (
                  <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-dropdown-in">
                    <div className="py-1">
                      <button
                        onClick={() => { setFilterClass('all'); setShowClassFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterClass === 'all' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        All Classes
                        {filterClass === 'all' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterClass('ss-1'); setShowClassFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterClass === 'ss-1' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        SS 1
                        {filterClass === 'ss-1' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterClass('ss-2'); setShowClassFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterClass === 'ss-2' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        SS 2
                        {filterClass === 'ss-2' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterClass('ss-3'); setShowClassFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterClass === 'ss-3' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        SS 3
                        {filterClass === 'ss-3' && <Check size={14} className="ml-auto" />}
                      </button>
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
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Subject</th>
                <th>Score</th>
                <th>Percentage</th>
                <th>Grade</th>
                <th>Term</th>
                <th>Exam</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!examResults || !subjects || !allStudents ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-500 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredGrades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <Award size={32} className="text-violet-400" />
                      </div>
                      <p className="text-slate-500 font-medium">No grades recorded</p>
                      <button onClick={() => setShowForm(true)} className="text-primary-500 hover:text-primary-600 text-sm">
                        Add your first grade
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredGrades.map(grade => {
                const percentage = Math.round((grade.score / grade.maxScore) * 100);
                const gradeInfo = getGrade(percentage);
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
                  <tr key={grade.id}>
                    <td className="font-medium">{grade.studentName}</td>
                    <td>{grade.subjectName}</td>
                    <td className="font-semibold">{grade.score}/{grade.maxScore}</td>
                    <td className="font-semibold">{percentage}%</td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-bold ${gradeColors[gradeInfo.grade] || 'bg-slate-100 text-slate-700'}`}>
                        {gradeInfo.grade}
                      </span>
                    </td>
                    <td><span className="badge badge-info">Term {grade.term}</span></td>
                    <td className="text-slate-500 text-sm">{grade.examType}</td>
                    <td>
                      <button onClick={() => handleDelete(grade.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-x-0 top-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Award size={24} className="text-violet-500" />
                Add Grade
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="form-label">Student</label>
                <select value={formData.studentId} onChange={e => setFormData(prev => ({ ...prev, studentId: e.target.value }))} className="form-input" required>
                  <option value="">Select Student</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.admissionNo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Subject</label>
                <select value={formData.subjectId} onChange={e => setFormData(prev => ({ ...prev, subjectId: e.target.value }))} className="form-input" required>
                  <option value="">Select Subject</option>
                  {(subjects || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Score</label>
                  <input type="number" value={formData.score} onChange={e => setFormData(prev => ({ ...prev, score: e.target.value }))} className="form-input" required min="0" />
                </div>
                <div>
                  <label className="form-label">Max Score</label>
                  <input type="number" value={formData.maxScore} onChange={e => setFormData(prev => ({ ...prev, maxScore: e.target.value }))} className="form-input" required min="1" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Term</label>
                  <select value={formData.term} onChange={e => setFormData(prev => ({ ...prev, term: e.target.value }))} className="form-input">
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Year</label>
                  <input type="number" value={formData.year} onChange={e => setFormData(prev => ({ ...prev, year: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Exam Type</label>
                  <select value={formData.examType} onChange={e => setFormData(prev => ({ ...prev, examType: e.target.value }))} className="form-input">
                    <option value="Mid-Term">Mid-Term</option>
                    <option value="End-Term">End-Term</option>
                    <option value="CAT">CAT</option>
                    <option value="Final">Final Exam</option>
                  </select>
                </div>
              </div>
              {formData.score && formData.maxScore && (
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-sm text-slate-500 mb-2">Preview</p>
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-bold text-slate-800 dark:text-white">
                      {Math.round((parseFloat(formData.score) / parseFloat(formData.maxScore)) * 100)}%
                    </span>
                    <span className={`px-3 py-1 rounded-lg font-bold ${getGrade(Math.round((parseFloat(formData.score) / parseFloat(formData.maxScore)) * 100)).grade.startsWith('D') ? 'bg-emerald-100 text-emerald-700' : getGrade(Math.round((parseFloat(formData.score) / parseFloat(formData.maxScore)) * 100)).grade.startsWith('C') ? 'bg-blue-100 text-blue-700' : getGrade(Math.round((parseFloat(formData.score) / parseFloat(formData.maxScore)) * 100)).grade.startsWith('P') ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {getGrade(Math.round((parseFloat(formData.score) / parseFloat(formData.maxScore)) * 100)).grade}
                    </span>
                    <span className="text-sm text-slate-500">
                      {getGrade(Math.round((parseFloat(formData.score) / parseFloat(formData.maxScore)) * 100)).remark}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Grade</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInvoiceModal && (
        <div className="fixed inset-x-0 top-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setShowInvoiceModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
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
                <button onClick={() => setShowInvoiceModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleCreateExamFeeInvoice} className="btn btn-primary">
                  Create Invoices
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-x-0 top-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Grades</h2>
              </div>
              <button onClick={closeImportModal} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(85vh-56px)]">
              {importStep === 'upload' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg transition-colors text-sm font-medium">
                      <Download size={14} />
                      Download Template
                    </button>
                  </div>

                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer text-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload CSV file</p>
                    <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-2 text-sm">Expected Fields:</h4>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {gradeExpectedFields.map(field => (
                        <div key={field.key} className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${field.required ? 'bg-red-500' : 'bg-slate-400'}`} />
                          <span className="text-slate-600 dark:text-slate-300 truncate">{field.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {importStep === 'map' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded">1</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">2 Map</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 rounded">3</span>
                  </div>

                  <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {gradeExpectedFields.filter(f => f.required).map(field => (
                          <tr key={field.key}>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">
                              {field.label}*
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                value={fieldMapping[field.key] || ''}
                                onChange={(e) => setFieldMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                className="w-full form-input py-1 px-2 text-xs"
                              >
                                <option value="">-- Skip --</option>
                                {csvHeaders.map(header => (
                                  <option key={header} value={header}>{header}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={closeImportModal} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={processMapping} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
                      Preview <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'preview' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 1</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 2</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3</span>
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      <strong>{importPreview.length}</strong> grades ready to import
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Student</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.slice(0, 5).map((grade, index) => {
                          const student = students.find(s => s.id === grade.studentId);
                          return (
                            <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                              <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                              <td className="px-2 py-1.5">{student ? `${student.firstName} ${student.lastName}` : (grade.studentId as string)?.slice(0, 8) || '-'}</td>
                              <td className="px-2 py-1.5">{grade.score as number}/{grade.maxScore as number}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {importPreview.length > 5 && (
                      <div className="p-2 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-700/50">
                        ... and {importPreview.length - 5} more
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm">Back</button>
                    <button onClick={executeImport} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
                      <Check size={14} /> Import {importPreview.length}
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
