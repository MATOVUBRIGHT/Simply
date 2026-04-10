import { useEffect, useState, useRef } from 'react';
import { Plus, Trash2, Book, BookOpen, GraduationCap, Hash, ChevronDown, Download, Upload, FileText, X, ArrowRight, Check, Square, CheckSquare, Trash } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Class, Subject } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { getClassDisplayName } from '../utils/classroom';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/DataService';
import { addToRecycleBin } from '../utils/recycleBin';

const ugandaSubjects: Record<string, { name: string; code: string }[]> = {
  'primary': [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English', code: 'ENG' },
    { name: 'Science', code: 'SCI' },
    { name: 'Social Studies', code: 'SST' },
    { name: 'Religious Education', code: 'RE' },
    { name: 'Physical Education', code: 'PE' },
    { name: 'Art & Craft', code: 'ART' },
    { name: 'Music', code: 'MUS' },
    { name: 'Agriculture', code: 'AGR' },
    { name: 'Local Languages', code: 'LL' },
  ],
  'jss': [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English', code: 'ENG' },
    { name: 'Physics', code: 'PHY' },
    { name: 'Chemistry', code: 'CHEM' },
    { name: 'Biology', code: 'BIO' },
    { name: 'Geography', code: 'GEO' },
    { name: 'History', code: 'HIST' },
    { name: 'Religious Education', code: 'RE' },
    { name: 'Computer Studies', code: 'COMP' },
    { name: 'Art & Design', code: 'ART' },
    { name: 'Music', code: 'MUS' },
    { name: 'Agriculture', code: 'AGR' },
    { name: 'Entrepreneurship', code: 'ENT' },
    { name: 'Physical Education', code: 'PE' },
  ],
  'ss': [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English', code: 'ENG' },
    { name: 'Physics', code: 'PHY' },
    { name: 'Chemistry', code: 'CHEM' },
    { name: 'Biology', code: 'BIO' },
    { name: 'Geography', code: 'GEO' },
    { name: 'History', code: 'HIST' },
    { name: 'Religious Education', code: 'RE' },
    { name: 'Computer Studies', code: 'COMP' },
    { name: 'Art & Design', code: 'ART' },
    { name: 'Music', code: 'MUS' },
    { name: 'Agriculture', code: 'AGR' },
    { name: 'Entrepreneurship', code: 'ENT' },
    { name: 'Economics', code: 'ECON' },
    { name: 'Commerce', code: 'COMM' },
    { name: 'Literature', code: 'LIT' },
    { name: 'Latin', code: 'LAT' },
    { name: 'French', code: 'FRE' },
    { name: 'Chinese', code: 'CHI' },
    { name: 'German', code: 'GER' },
    { name: 'Arabic', code: 'ARA' },
    { name: 'Physical Education', code: 'PE' },
    { name: 'General Paper', code: 'GP' },
  ],
};

export default function Subjects() {
  const { user, schoolId } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', code: '', classId: '', customSubject: false });
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Subject>[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);

  const subjectExpectedFields = [
    { key: 'name', label: 'Subject Name', required: true },
    { key: 'code', label: 'Code', required: true },
    { key: 'classId', label: 'Class', required: true },
  ];

  useEffect(() => {
    if (user?.id || schoolId) {
      loadSubjects();
      loadClasses();
    }
  }, [user?.id, schoolId]);

  useEffect(() => {
    const handleSubjectsUpdated = () => { loadSubjects(); loadClasses(); };
    const handleDataRefresh = () => { loadSubjects(); loadClasses(); };
    
    window.addEventListener('subjectsUpdated', handleSubjectsUpdated);
    window.addEventListener('classesUpdated', handleSubjectsUpdated);
    window.addEventListener('dataRefresh', handleDataRefresh);
    
    return () => {
      window.removeEventListener('subjectsUpdated', handleSubjectsUpdated);
      window.removeEventListener('classesUpdated', handleSubjectsUpdated);
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, []);

  async function loadSubjects() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const data = await dataService.getAll(id, 'subjects');
      const sorted = data.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });
      setSubjects(sorted);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadClasses() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const data = await dataService.getAll(id, 'classes');
      setClasses(data.sort((left, right) => left.name.localeCompare(right.name)));
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  }

  function getClassLevel(classId: string) {
    if (classId.startsWith('primary')) return 'primary';
    if (classId.startsWith('jss')) return 'jss';
    if (classId.startsWith('ss')) return 'ss';
    return '';
  }

  function generateSubjectCode(name: string) {
    const cleaned = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim();
    if (!cleaned) return '';

    const words = cleaned.split(/\s+/).filter(Boolean);
    const base = words.length === 1
      ? words[0].slice(0, 4)
      : words.map((word) => word[0]).join('').slice(0, 6);

    const existingCodes = new Set(subjects.map((subject) => subject.code.toUpperCase()));
    if (!existingCodes.has(base)) {
      return base;
    }

    let suffix = 2;
    while (existingCodes.has(`${base}${suffix}`)) {
      suffix += 1;
    }

    return `${base}${suffix}`;
  }

  const classesForSelectedLevel = classes.filter((classItem) => getClassLevel(classItem.id) === selectedLevel);

  function resetSubjectForm() {
    setShowForm(false);
    setSelectedLevel('');
    setSelectedClassIds([]);
    setFormData({ name: '', code: '', classId: '', customSubject: false });
  }

  function toggleClassSelection(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId],
    );
  }

  function handleSelectAllClasses() {
    const levelClassIds = classesForSelectedLevel.map((classItem) => classItem.id);
    setSelectedClassIds((prev) =>
      prev.length === levelClassIds.length ? [] : levelClassIds,
    );
  }

  function handleRowClick(subjectId: string) {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      if (lastClickedId === subjectId) {
        setSelectMode(true);
        setSelectedSubjects(prev => {
          const newSet = new Set(prev);
          newSet.add(subjectId);
          return newSet;
        });
      } else {
        setSelectedSubjects(prev => {
          const newSet = new Set(prev);
          if (newSet.has(subjectId)) {
            newSet.delete(subjectId);
          } else {
            newSet.add(subjectId);
          }
          return newSet;
        });
      }
      setLastClickedId(null);
    } else {
      setLastClickedId(subjectId);
      clickTimeoutRef.current = window.setTimeout(() => {
        if (!selectMode) {
          setLastClickedId(null);
        }
        clickTimeoutRef.current = null;
      }, 300);
    }
  }

  function handleSelectAll() {
    if (selectedSubjects.size === subjects.length) {
      setSelectedSubjects(new Set());
    } else {
      setSelectedSubjects(new Set(subjects.map(s => s.id)));
    }
  }

  async function handleBulkDelete() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedSubjects.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedSubjects.size} subject(s)?`)) return;
    
    try {
      const now = new Date().toISOString();
      
      for (const idSubject of selectedSubjects) {
        const subject = subjects.find(s => s.id === idSubject);
        if (subject) {
          await dataService.delete(id, 'subjects', idSubject);
          addToRecycleBin(id, {
            id: `subject-${Date.now()}-${Math.random()}`,
            type: 'subject',
            name: subject.name,
            data: subject,
            deletedAt: now
          });
        }
      }
      
      setSubjects(prev => prev.filter(s => !selectedSubjects.has(s.id)));
      setSelectedSubjects(new Set());
      setSelectMode(false);
      addToast(`${selectedSubjects.size} subjects moved to recycle bin`, 'success');
    } catch (error) {
      addToast('Failed to delete subjects', 'error');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name || !formData.code || selectedClassIds.length === 0 || !selectedLevel) {
      addToast('Please fill all required fields', 'error');
      return;
    }
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const now = new Date().toISOString();
      const existingKeys = new Set(subjects.map((subject) => `${subject.name.toLowerCase()}::${subject.classId}`));
      const newSubjects = selectedClassIds
        .filter((classId) => !existingKeys.has(`${formData.name.toLowerCase()}::${classId}`))
        .map((classId) => ({
          id: uuidv4(),
          name: formData.name,
          code: formData.code,
          classId,
          createdAt: now,
        } satisfies Subject));

      if (newSubjects.length === 0) {
        addToast('Those subject entries already exist for the selected classes', 'warning');
        return;
      }

      for (const subject of newSubjects) {
        await dataService.create(id, 'subjects', subject as any);
      }
      setSubjects((prev) => [...newSubjects, ...prev]);
      resetSubjectForm();
      addToast(`Added ${newSubjects.length} subject entr${newSubjects.length === 1 ? 'y' : 'ies'} successfully`, 'success');
    } catch (error) {
      addToast('Failed to add subject', 'error');
    }
  }

  async function handleDelete(idSubject: string) {
    const id = schoolId || user?.id;
    if (confirm('Delete this subject?')) {
      if (!id) return;
      try {
        const subject = subjects.find(s => s.id === idSubject);
        await dataService.delete(id, 'subjects', idSubject);
        
        if (subject) {
          addToRecycleBin(id, {
            id: `subject-${Date.now()}`,
            type: 'subject',
            name: subject.name,
            data: subject,
            deletedAt: new Date().toISOString()
          });
        }
        
        setSubjects(prev => prev.filter(s => s.id !== idSubject));
        addToast('Subject moved to recycle bin', 'success');
      } catch (error) {
        addToast('Failed to delete', 'error');
      }
    }
  }

  function handleExportCSV() {
    const columns = [
      { key: 'name' as keyof Subject, label: 'Subject Name' },
      { key: 'code' as keyof Subject, label: 'Code' },
      { key: 'classId' as keyof Subject, label: 'Class' },
    ];
    exportToCSV(subjects, 'subjects', columns);
    addToast('Exported to CSV', 'success');
  }

  function handleExportPDF() {
    const columns = [
      { key: 'name', label: 'Subject Name' },
      { key: 'code', label: 'Code' },
      { key: 'classId', label: 'Class' },
    ];
    exportToPDF('Subjects Report', subjects, columns, 'subjects');
    addToast('Exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    const columns = [
      { key: 'name' as keyof Subject, label: 'Subject Name' },
      { key: 'code' as keyof Subject, label: 'Code' },
      { key: 'classId' as keyof Subject, label: 'Class' },
    ];
    exportToExcel(subjects, 'subjects', columns);
    addToast('Exported to Excel', 'success');
    setShowExportMenu(false);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function downloadTemplate() {
    const headers = subjectExpectedFields.map(f => f.label);
    const sampleRow = ['Mathematics', 'MATH', 'primary'];
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'subject-import-template.csv';
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
      subjectExpectedFields.forEach(field => {
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
    const mappedData: Partial<Subject>[] = [];
    for (const row of csvData) {
      const subject: Partial<Subject> = {};
      subjectExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            (subject as any)[field.key] = row[headerIndex];
          }
        }
      });
      if (subject.name) mappedData.push(subject);
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (importPreview.length === 0 || !id) { addToast('No valid subjects to import', 'error'); return; }
    try {
      const now = new Date().toISOString();
      let successCount = 0;
      for (const data of importPreview) {
        const subject: Subject = {
          id: uuidv4(),
          name: (data.name as string) || 'Unknown',
          code: (data.code as string) || 'UNK',
          classId: (data.classId as string) || 'primary',
          createdAt: now,
        };
        await dataService.create(id, 'subjects', subject as any);
        successCount++;
      }
      await loadSubjects();
      addToast(`Successfully imported ${successCount} subjects`, 'success');
      closeImportModal();
    } catch (error) { addToast('Failed to import subjects', 'error'); }
  }

  const subjectColors = [
    'from-coral-400 to-orange-400',
    'from-teal-400 to-cyan-400',
    'from-violet-400 to-purple-400',
    'from-emerald-400 to-green-400',
    'from-rose-400 to-pink-400',
    'from-sky-400 to-blue-400',
    'from-amber-400 to-yellow-400',
  ];

  function getSubjectColor(name: string) {
    const index = name.charCodeAt(0) % subjectColors.length;
    return subjectColors[index];
  }

  const uniqueSubjects = [...new Set(subjects.map(s => s.name))];
  const primaryCount = subjects.filter(s => s.classId?.includes('primary')).length;
  const secondaryCount = subjects.filter(s => s.classId?.includes('jss') || s.classId?.includes('ss')).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Subjects
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage subjects for each class</p>
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
          <button onClick={() => setShowForm(true)} className="btn btn-primary shadow-lg shadow-primary-500/25">
            <Plus size={16} />
            Add Subject
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-solid-purple p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-violet text-white">
              <Book size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Total Subjects</p>
              <p className="text-3xl font-bold text-white">
                {uniqueSubjects.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-emerald p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-green text-white">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Total Entries</p>
              <p className="text-3xl font-bold text-white">
                {subjects.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-indigo p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-blue text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Primary</p>
              <p className="text-3xl font-bold text-white">
                {primaryCount}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-violet p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-amber text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Secondary</p>
              <p className="text-3xl font-bold text-white">
                {secondaryCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="card border-2 border-violet-200 dark:border-violet-800">
          <div className="card-header bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
            <h3 className="font-bold text-violet-700 dark:text-violet-300 flex items-center gap-2">
              <Plus size={20} />
              Add New Subject
            </h3>
          </div>
          <form onSubmit={handleSubmit} className="card-body grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="form-label">Education Level</label>
              <select
                value={selectedLevel}
                onChange={e => {
                  setSelectedLevel(e.target.value);
                  setSelectedClassIds([]);
                  setFormData(prev => ({ ...prev, name: '', code: '', classId: '', customSubject: false }));
                }}
                className="form-input"
              >
                <option value="">Select Level</option>
                <option value="primary">Primary (P1-P7)</option>
                <option value="jss">Junior Secondary (JSS 1-3)</option>
                <option value="ss">Senior Secondary (SS 1-3)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="form-label">Subject</label>
              {selectedLevel ? (
                <select
                  value={formData.customSubject ? 'custom' : formData.name}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setFormData(prev => ({ ...prev, name: '', code: '', customSubject: true }));
                    } else {
                      const selected = ugandaSubjects[selectedLevel]?.find(s => s.name === e.target.value);
                      if (selected) {
                        setFormData(prev => ({ ...prev, name: selected.name, code: generateSubjectCode(selected.name) || selected.code, customSubject: false }));
                      }
                    }
                  }}
                  className="form-input"
                >
                  <option value="">Select Subject</option>
                  {ugandaSubjects[selectedLevel]?.map(s => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                  <option value="custom">+ Custom Subject</option>
                </select>
              ) : (
                <input className="form-input bg-slate-50 dark:bg-slate-800" disabled placeholder="Select level first" />
              )}
            </div>
            <div className="space-y-2">
              <label className="form-label">Subject Code</label>
              <div className="relative">
                <Hash size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input 
                  value={formData.code} 
                  onChange={e => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))} 
                  className="input-with-icon" 
                  required 
                  placeholder={formData.customSubject ? "e.g., CHEM" : "Auto-filled"} 
                  maxLength={10}
                />
              </div>
            </div>
            {formData.customSubject && (
              <div className="space-y-2">
                <label className="form-label">Custom Subject Name</label>
                <input 
                  value={formData.name} 
                  onChange={e => {
                    const nextName = e.target.value;
                    setFormData(prev => ({ ...prev, name: nextName, code: generateSubjectCode(nextName) }));
                  }} 
                  className="form-input" 
                  required 
                  placeholder="Enter custom subject name" 
                />
              </div>
            )}
            <div className="space-y-2 md:col-span-3">
              <div className="flex items-center justify-between gap-3">
                <label className="form-label mb-0">Classes</label>
                {classesForSelectedLevel.length > 0 && (
                  <button type="button" onClick={handleSelectAllClasses} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                    {selectedClassIds.length === classesForSelectedLevel.length ? 'Clear all' : 'Select all classes'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {classesForSelectedLevel.length > 0 ? classesForSelectedLevel.map((classItem) => {
                  const isSelected = selectedClassIds.includes(classItem.id);
                  return (
                    <button
                      key={classItem.id}
                      type="button"
                      onClick={() => toggleClassSelection(classItem.id)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/20 dark:text-indigo-300'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600'
                      }`}
                    >
                      <span>{getClassDisplayName(classItem.id, classes)}</span>
                      {isSelected && <Check size={14} />}
                    </button>
                  );
                }) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {selectedLevel ? 'No classes found for this level yet.' : 'Select a level first.'}
                  </div>
                )}
              </div>
              {selectedClassIds.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedClassIds.length} class{selectedClassIds.length === 1 ? '' : 'es'} selected. This subject will be added to each selected class.
                </p>
              )}
            </div>
            <div className="md:col-span-3 flex gap-2">
              <button type="submit" className="btn btn-primary">
                <Book size={16} /> Add Subject{selectedClassIds.length > 1 ? 's' : ''}
              </button>
              <button type="button" onClick={resetSubjectForm} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-header bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-400 flex items-center justify-center shadow-md">
                <BookOpen size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">All Subjects</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{subjects.length} subject entries</p>
              </div>
            </div>
        </div>
        <div className="table-container">
          {selectMode && selectedSubjects.size > 0 && (
            <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
              <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium">
                {selectedSubjects.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {selectedSubjects.size === subjects.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-1"
                >
                  <Trash size={12} />
                  Delete
                </button>
                <button
                  onClick={() => { setSelectedSubjects(new Set()); setSelectMode(false); }}
                  className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th className="w-12">#</th>
                {selectMode && <th className="w-10">
                  <button onClick={handleSelectAll} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                    {selectedSubjects.size === subjects.length && subjects.length > 0 ? (
                      <CheckSquare size={16} className="text-primary-600" />
                    ) : (
                      <Square size={16} className="text-slate-400" />
                    )}
                  </button>
                </th>}
                <th>Subject</th>
                <th>Code</th>
                <th>Class</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={selectMode ? 6 : 5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
                      <p className="text-slate-500">Loading subjects...</p>
                    </div>
                  </td>
                </tr>
              ) : subjects.length === 0 ? (
                <tr>
                  <td colSpan={selectMode ? 6 : 5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <Book size={32} className="text-violet-400" />
                      </div>
                      <p className="text-slate-500 font-medium">No subjects yet</p>
                      <p className="text-slate-400 text-sm">Add subjects for your classes</p>
                      <button onClick={() => setShowForm(true)} className="text-primary-500 hover:text-primary-600 text-sm">
                        Add your first subject
                      </button>
                    </div>
                  </td>
                </tr>
              ) : subjects.map((s, index) => (
                <tr 
                  key={s.id}
                  className={`cursor-pointer transition-colors ${selectedSubjects.has(s.id) ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                  onClick={() => selectMode && handleRowClick(s.id)}
                  onDoubleClick={() => !selectMode && setShowForm(true)}
                >
                  <td className="text-center text-xs text-slate-400 dark:text-slate-500">
                    {index + 1}
                  </td>
                  {selectMode && (
                    <td className="text-center">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedSubjects.has(s.id) 
                          ? 'bg-primary-600 border-primary-600' 
                          : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {selectedSubjects.has(s.id) && (
                          <Check size={12} className="text-white" />
                        )}
                      </div>
                    </td>
                  )}
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getSubjectColor(s.name)} flex items-center justify-center shadow-md`}>
                        <Book size={18} className="text-white" />
                      </div>
                      <span className="font-semibold text-slate-800 dark:text-white">{s.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 font-mono text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {s.code}
                    </span>
                  </td>
                  <td>
                    <span className="badge badge-info">{getClassDisplayName(s.classId, classes)}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => handleDelete(s.id)} 
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-x-0 top-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Subjects</h2>
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
                      {subjectExpectedFields.map(field => (
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
                        {subjectExpectedFields.filter(f => f.required).map(field => (
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
                      <strong>{importPreview.length}</strong> subjects ready to import
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Code</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.slice(0, 5).map((subject, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{(subject as any).name || '-'}</td>
                            <td className="px-2 py-1.5">{(subject as any).code || '-'}</td>
                          </tr>
                        ))}
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
