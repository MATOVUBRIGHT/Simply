import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Plus, Edit, Trash2, Users, BookOpen, GraduationCap, Download, Upload, FileText, ChevronDown, X, ArrowRight, Check, Trash, Clock, Calendar } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Class } from '@schofy/shared';
import { generateUUID } from '../utils/uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { addToRecycleBin } from '../utils/recycleBin';
import { useTableData } from '../lib/store';
import { useConfirm } from '../components/ConfirmModal';

const classColors = [
  { card: 'card-coral-light', gradient: 'from-orange-100 to-amber-100', text: 'text-orange-600' },
  { card: 'card-teal-light', gradient: 'from-teal-100 to-cyan-100', text: 'text-teal-600' },
  { card: 'card-violet-light', gradient: 'from-violet-100 to-purple-100', text: 'text-violet-600' },
  { card: 'card-emerald-light', gradient: 'from-emerald-100 to-green-100', text: 'text-emerald-600' },
  { card: 'card-sky-light', gradient: 'from-sky-100 to-blue-100', text: 'text-sky-600' },
  { card: 'card-amber-light', gradient: 'from-amber-100 to-orange-100', text: 'text-amber-600' },
  { card: 'card-rose-light', gradient: 'from-rose-100 to-pink-100', text: 'text-rose-600' },
  { card: 'card-indigo-light', gradient: 'from-indigo-100 to-blue-100', text: 'text-indigo-600' },
  { card: 'card-purple-light', gradient: 'from-purple-100 to-violet-100', text: 'text-purple-600' },
  { card: 'card-cyan-light', gradient: 'from-cyan-100 to-teal-100', text: 'text-cyan-600' },
];

function getClassColor(index: number) {
  return classColors[index % classColors.length];
}

export default function Classes() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const confirm = useConfirm();
  const { data: classesData, loading } = useTableData(sid, 'classes');
  const { data: allStudentsData } = useTableData(sid, 'students');

  // Sort classes by level
  const classes = useMemo(
    () => [...classesData].sort((a: any, b: any) => a.level - b.level),
    [classesData]
  );

  // Compute enrollment counts from store data
  const classEnrollmentCounts = useMemo(() => {
    return allStudentsData
      .filter((student: any) => student.status !== 'completed')
      .reduce<Record<string, number>>((counts: Record<string, number>, student: any) => {
        counts[student.classId] = (counts[student.classId] || 0) + 1;
        return counts;
      }, {});
  }, [allStudentsData]);

  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState({ name: '', level: 1, stream: '', capacity: 40 });
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Class>[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);

  // Timetable state
  const { data: subjectsData } = useTableData(sid, 'subjects');
  const { data: staffData } = useTableData(sid, 'staff');
  const { data: timetableData } = useTableData(sid, 'timetable');
  const [showTimetable, setShowTimetable] = useState(false);
  const [timetableClassId, setTimetableClassId] = useState('');
  const [ttForm, setTtForm] = useState({ subjectId: '', teacherId: '', dayOfWeek: '1', startTime: '08:00', endTime: '09:00' });
  const [ttSaving, setTtSaving] = useState(false);

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const timetableForClass = useMemo(() =>
    (timetableData as any[]).filter(t => t.classId === timetableClassId)
      .sort((a: any, b: any) => Number(a.dayOfWeek) - Number(b.dayOfWeek) || a.startTime.localeCompare(b.startTime)),
    [timetableData, timetableClassId]
  );

  function timeToMins(t: string) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function detectCollision(day: string, start: string, end: string, excludeId?: string) {
    const s = timeToMins(start), e = timeToMins(end);
    return timetableForClass.filter(t => {
      if (excludeId && t.id === excludeId) return false;
      if (String(t.dayOfWeek) !== String(day)) return false;
      const ts = timeToMins(t.startTime), te = timeToMins(t.endTime);
      return s < te && e > ts;
    });
  }

  async function handleAddTimetable() {
    if (!ttForm.subjectId || !ttForm.startTime || !ttForm.endTime) {
      addToast('Select subject, start and end time', 'error'); return;
    }
    if (timeToMins(ttForm.endTime) <= timeToMins(ttForm.startTime)) {
      addToast('End time must be after start time', 'error'); return;
    }
    const collisions = detectCollision(ttForm.dayOfWeek, ttForm.startTime, ttForm.endTime);
    if (collisions.length > 0) {
      const sub = (subjectsData as any[]).find(s => s.id === collisions[0].subjectId);
      addToast(`Time collision with ${sub?.name || 'another subject'} (${collisions[0].startTime}–${collisions[0].endTime})`, 'error');
      return;
    }
    setTtSaving(true);
    try {
      await dataService.create(sid, 'timetable', {
        id: generateUUID(), classId: timetableClassId,
        subjectId: ttForm.subjectId, teacherId: ttForm.teacherId || null,
        dayOfWeek: ttForm.dayOfWeek, startTime: ttForm.startTime, endTime: ttForm.endTime,
        createdAt: new Date().toISOString(),
      } as any);
      setTtForm(p => ({ ...p, subjectId: '', teacherId: '' }));
      addToast('Period added', 'success');
    } catch { addToast('Failed to add period', 'error'); }
    finally { setTtSaving(false); }
  }

  async function handleDeleteTimetable(id: string) {
    await dataService.delete(sid, 'timetable', id);
    addToast('Period removed', 'success');
  }

  const classExpectedFields = [
    { key: 'name', label: 'Class Name', required: true },
    { key: 'level', label: 'Level', required: true },
    { key: 'stream', label: 'Stream', required: false },
    { key: 'capacity', label: 'Capacity', required: false },
  ];

  function handleRowClick(classId: string) {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      if (lastClickedId === classId) {
        setSelectMode(true);
        setSelectedClasses(prev => {
          const newSet = new Set(prev);
          newSet.add(classId);
          return newSet;
        });
      } else {
        setSelectedClasses(prev => {
          const newSet = new Set(prev);
          if (newSet.has(classId)) {
            newSet.delete(classId);
          } else {
            newSet.add(classId);
          }
          return newSet;
        });
      }
      setLastClickedId(null);
    } else {
      setLastClickedId(classId);
      clickTimeoutRef.current = window.setTimeout(() => {
        if (!selectMode) {
          setLastClickedId(null);
        }
        clickTimeoutRef.current = null;
      }, 300);
    }
  }

  function handleSelectAll() {
    if (selectedClasses.size === classes.length) {
      setSelectedClasses(new Set());
    } else {
      setSelectedClasses(new Set(classes.map(c => c.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedClasses.size === 0) return;
    const ok = await confirm({ title: `Delete ${selectedClasses.size} Class(es)`, description: `Move ${selectedClasses.size} class(es) to the recycle bin?`, confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    const id = schoolId || user?.id;
    if (!id) return;
    
    try {
      const now = new Date().toISOString();
      const idsToDelete = Array.from(selectedClasses);
      
      for (const classId of idsToDelete) {
        const classItem = classes.find(c => c.id === classId);
        if (classItem) {
          await dataService.delete(id, 'classes', classId);
          addToRecycleBin(id, {
            id: `class-${Date.now()}-${Math.random()}`,
            type: 'class',
            name: classItem.name,
            data: classItem,
            deletedAt: now
          });
        }
      }
      
      setSelectedClasses(new Set());
      setSelectMode(false);
      addToast(`${selectedClasses.size} classes moved to recycle bin`, 'success');
    } catch (error) {
      console.error('Bulk delete error:', error);
      addToast('Failed to delete classes', 'error');
    }
  }

  function handleEdit(c: Class) {
    setEditingClass(c);
    setFormData({ name: c.name, level: c.level, stream: c.stream || '', capacity: c.capacity });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const now = new Date().toISOString();
      if (editingClass) {
        await dataService.update(id, 'classes', editingClass.id, { ...editingClass, ...formData, updatedAt: now });
        addToast('Class updated successfully', 'success');
      } else {
        const newClass: Class = { id: generateUUID(), schoolId: id, name: formData.name, level: formData.level, stream: formData.stream, capacity: formData.capacity, createdAt: now };
        await dataService.create(id, 'classes', newClass);
        addToast('Class added successfully', 'success');
      }
      setShowForm(false);
      setEditingClass(null);
      setFormData({ name: '', level: 1, stream: '', capacity: 40 });
    } catch (error) {
      addToast('Failed to save class', 'error');
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: 'Delete Class', description: 'Move this class to the recycle bin?', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    const authId = schoolId || user?.id;
    if (!authId) return;
    try {
      const classItem = classes.find(c => c.id === id);
      await dataService.delete(authId, 'classes', id);
      if (classItem) {
        addToRecycleBin(authId, {
          id: `class-${Date.now()}`,
          type: 'class',
          name: classItem.name,
          data: classItem,
          deletedAt: new Date().toISOString()
        });
      }
      addToast('Class moved to recycle bin', 'success');
    } catch (error) {
      addToast('Failed to delete', 'error');
    }
  }

  function handleExportCSV() {
    exportToCSV(classes, 'classes', [
      { key: 'name' as keyof Class, label: 'Class Name' },
      { key: 'level' as keyof Class, label: 'Level' },
      { key: 'stream' as keyof Class, label: 'Stream' },
      { key: 'capacity' as keyof Class, label: 'Capacity' },
    ]);
    addToast('Classes exported to CSV', 'success');
  }

  function handleExportPDF() {
    exportToPDF('Classes Report', classes, [
      { key: 'name', label: 'Class Name' },
      { key: 'level', label: 'Level' },
      { key: 'stream', label: 'Stream' },
      { key: 'capacity', label: 'Capacity' },
    ], 'classes');
    addToast('Classes exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    exportToExcel(classes, 'classes', [
      { key: 'name' as keyof Class, label: 'Class Name' },
      { key: 'level' as keyof Class, label: 'Level' },
      { key: 'stream' as keyof Class, label: 'Stream' },
      { key: 'capacity' as keyof Class, label: 'Capacity' },
    ]);
    addToast('Classes exported to Excel', 'success');
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
    import('xlsx').then(({ utils, writeFile }) => {
      const headers = classExpectedFields.map(f => f.label);
      const sampleRows = [
        ['Baby Class', '1', '', '30'],
        ['Nursery', '2', '', '30'],
        ['P.1', '3', 'A', '40'],
        ['P.1', '4', 'B', '40'],
        ['P.2', '5', '', '40'],
        ['S.1', '6', '', '45'],
      ];
      const ws = utils.aoa_to_sheet([
        ['// Example: Class Name must match your school format. Level = sort order. Stream = A/B/C (optional).'],
        headers,
        ...sampleRows,
      ]);
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Classes');
      writeFile(wb, 'class-import-template.xlsx');
      addToast('Template downloaded', 'success');
    });
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvData([]);
    setFieldMapping({});
    setImportPreview([]);
    setIsImporting(false);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });
      const dataRows = rows.filter((r: any[]) => !String(r[0] ?? '').startsWith('//'));
      if (dataRows.length < 2) { addToast('File must have headers and at least one data row', 'error'); return; }
      const headers = dataRows[0].map((h: any) => String(h ?? '').trim()).filter(Boolean);
      const data = dataRows.slice(1).map((row: any[]) => headers.map((_: any, i: number) => String(row[i] ?? '').trim()));
      setCsvHeaders(headers);
      setCsvData(data);
      const norm = (s: string) => s.toLowerCase().replace(/[\s_()\-\/]/g, '').replace(/[^a-z0-9]/g, '');
      const camelWords = (s: string) => s.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/[\s_\-]/g, '');
      const autoMapping: Record<string, string> = {};
      classExpectedFields.forEach(field => {
        const nKey = norm(field.key); const nLabel = norm(field.label); const nCamel = camelWords(field.key);
        const matchingHeader = headers.find(h => { const nH = norm(h); return nH === nKey || nH === nLabel || nH === nCamel || nH.includes(nKey) || nKey.includes(nH) || nH.includes(nLabel) || nLabel.includes(nH); });
        if (matchingHeader) autoMapping[field.key] = matchingHeader;
      });
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) { addToast('Failed to read Excel file', 'error'); }
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
    const mappedData: Partial<Class>[] = [];
    for (const row of csvData) {
      const classItem: Partial<Class> = {};
      classExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            const val = row[headerIndex];
            if (field.key === 'level' || field.key === 'capacity') {
              (classItem as any)[field.key] = parseInt(val) || 0;
            } else {
              (classItem as any)[field.key] = val;
            }
          }
        }
      });
      if (classItem.name) mappedData.push(classItem);
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (importPreview.length === 0 || !id) { addToast('No valid classes to import', 'error'); return; }
    setIsImporting(true);
    setImportProgress(0);
    try {
      const now = new Date().toISOString();
      let successCount = 0;
      const previewSnapshot = [...importPreview];
      closeImportModal();
      addToast(`Importing ${previewSnapshot.length} class${previewSnapshot.length !== 1 ? 'es' : ''}... completing in background`, 'info');
      for (let i = 0; i < previewSnapshot.length; i++) {
        const data = previewSnapshot[i];
        const classItem: Class = {
          id: crypto.randomUUID(),
          schoolId: id,
          name: (data.name as string) || 'Unknown',
          level: (data.level as number) || 1,
          stream: (data.stream as string) || '',
          capacity: (data.capacity as number) || 40,
          createdAt: now,
        };
        await dataService.create(id, 'classes', classItem);
        successCount++;
        setImportProgress(Math.round(((i + 1) / importPreview.length) * 100));
      }
      addToast(`Successfully imported ${successCount} class${successCount !== 1 ? 'es' : ''}`, 'success');
    } catch (error) { addToast('Failed to import classes', 'error'); }
    finally { setIsImporting(false); setImportProgress(0); }
  }

  const totalEnrolled = classes.reduce((sum, classItem) => sum + (classEnrollmentCounts[classItem.id] || 0), 0);
  const totalCapacity = classes.reduce((sum, classItem) => sum + classItem.capacity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
            Classes
          </h1>
          <p className="text-slate-500">Manage school classes and streams</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-secondary" title="Export">
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button onClick={handleExportPDF} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <FileText size={14} /> Export PDF
                </button>
                <button onClick={handleExportCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <Download size={14} /> Export CSV
                </button>
                <button onClick={handleExportExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <FileText size={14} /> Export Excel
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" title="Import CSV">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx,.xls" className="hidden" />
          <button onClick={() => { setShowForm(true); setEditingClass(null); setFormData({ name: '', level: 1, stream: '', capacity: 40 }); }} className="btn btn-primary shadow-lg shadow-primary-500/25">
            <Plus size={18} /> Add Class
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-solid-purple p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <GraduationCap size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Total Classes</p>
              <p className="text-2xl font-bold text-white">{classes.length}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Students Enrolled</p>
              <p className="text-2xl font-bold text-white">{totalEnrolled}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <BookOpen size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Total Capacity</p>
              <p className="text-2xl font-bold text-white">{totalCapacity}</p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditingClass(null); } }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <h3 className="font-bold text-white flex items-center gap-2">
                <GraduationCap size={20} />
                {editingClass ? 'Edit Class' : 'Add New Class'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingClass(null); }} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="form-label">Class Name</label>
                <input value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="form-input" required placeholder="Primary 1" />
              </div>
              <div className="space-y-2">
                <label className="form-label">Level</label>
                <input type="number" value={formData.level} onChange={e => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) }))} className="form-input" min="1" />
              </div>
              <div className="space-y-2">
                <label className="form-label">Stream</label>
                <input value={formData.stream} onChange={e => setFormData(prev => ({ ...prev, stream: e.target.value }))} className="form-input" placeholder="A, B, C..." />
              </div>
              <div className="space-y-2">
                <label className="form-label">Capacity</label>
                <input type="number" value={formData.capacity} onChange={e => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) }))} className="form-input" />
              </div>
              <div className="col-span-2 flex gap-2 pt-2">
                <button type="submit" className="btn btn-primary flex-1">
                  <GraduationCap size={16} /> {editingClass ? 'Update' : 'Save'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingClass(null); }} className="btn btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-4">Loading classes...</p>
          </div>
        ) : classes.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
            <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <GraduationCap size={40} className="text-emerald-400" />
            </div>
            <p className="text-slate-500 font-medium mt-4">No classes yet</p>
            <p className="text-slate-400 text-sm mt-1">Add your first class to get started</p>
            <button
              onClick={() => { setShowForm(true); setEditingClass(null); setFormData({ name: '', level: 1, stream: '', capacity: 40 }); }}
              className="btn btn-primary mt-4"
            >
              <Plus size={16} /> Add Class
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {classes.map((c, index) => {
              const isSelected = selectedClasses.has(c.id);
              const enrolled = classEnrollmentCounts[c.id] || 0;
              const pct = c.capacity > 0 ? Math.round((enrolled / c.capacity) * 100) : 0;
              const full = enrolled >= c.capacity;
              return (
                <div
                  key={c.id}
                  id={`class-card-${c.id}`}
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-primary-50 dark:bg-primary-900/10 hover:bg-primary-50 dark:hover:bg-primary-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  onClick={() => handleRowClick(c.id)}
                >
                  {/* Select / index */}
                  {selectMode ? (
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary-600 border-primary-600' : 'border-slate-300 dark:border-slate-600'}`}>
                      {isSelected && <Check size={11} className="text-white" />}
                    </div>
                  ) : (
                    <span className="w-6 text-xs text-slate-400 text-center shrink-0">{index + 1}</span>
                  )}

                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <GraduationCap size={18} className="text-slate-500 dark:text-slate-400" />
                  </div>

                  {/* Name + level */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 dark:text-white">{c.name}</span>
                      {c.stream && <span className="badge badge-info text-xs">Stream {c.stream}</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Level {c.level}</p>
                  </div>

                  {/* Enrollment bar */}
                  <div className="hidden sm:flex flex-col items-end gap-1 w-32 shrink-0">
                    <span className="text-xs text-slate-500">{enrolled}/{c.capacity} students</span>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${full ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Slots */}
                  <span className={`hidden md:block text-xs font-medium w-20 text-right shrink-0 ${full ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {full ? 'Full' : `${c.capacity - enrolled} left`}
                  </span>

                  {/* Actions */}
                  {!selectMode && (
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setTimetableClassId(c.id); setShowTimetable(true); }}
                        className="p-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-600 rounded-lg transition-colors"
                        title="Timetable"
                      >
                        <Clock size={15} />
                      </button>
                      <button
                        onClick={() => handleEdit(c)}
                        className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-600 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectMode && selectedClasses.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900 dark:bg-slate-700 rounded-2xl shadow-xl animate-notif-in">
          <span className="text-sm text-white font-medium">
            {selectedClasses.size} selected
          </span>
          <div className="w-px h-6 bg-slate-600"></div>
          <button
            onClick={handleSelectAll}
            className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            {selectedClasses.size === classes.length ? 'Deselect All' : 'Select All'}
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-1"
          >
            <Trash size={14} />
            Delete
          </button>
          <button
            onClick={() => { setSelectedClasses(new Set()); setSelectMode(false); }}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Timetable Modal */}
      {showTimetable && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-white" />
                <h2 className="font-bold text-white">
                  Timetable — {classes.find(c => c.id === timetableClassId)?.name || ''}
                </h2>
              </div>
              <button onClick={() => setShowTimetable(false)} className="p-1 hover:bg-white/20 rounded-lg text-white"><X size={18} /></button>
            </div>

            {/* Add period form */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Day</label>
                  <select value={ttForm.dayOfWeek} onChange={e => setTtForm(p => ({ ...p, dayOfWeek: e.target.value }))} className="form-input">
                    {DAYS.map((d, i) => <option key={i} value={String(i + 1)}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Subject *</label>
                  <select value={ttForm.subjectId} onChange={e => setTtForm(p => ({ ...p, subjectId: e.target.value }))} className="form-input">
                    <option value="">— Select —</option>
                    {(subjectsData as any[]).filter(s => s.classId === timetableClassId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Teacher</label>
                  <select value={ttForm.teacherId} onChange={e => setTtForm(p => ({ ...p, teacherId: e.target.value }))} className="form-input">
                    <option value="">— Optional —</option>
                    {(staffData as any[]).filter(s => s.role === 'teacher' || s.role === 'Teacher').map(s => (
                      <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Start Time *</label>
                  <input type="time" value={ttForm.startTime} onChange={e => setTtForm(p => ({ ...p, startTime: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">End Time *</label>
                  <input type="time" value={ttForm.endTime} onChange={e => setTtForm(p => ({ ...p, endTime: e.target.value }))} className="form-input" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleAddTimetable} disabled={ttSaving} className="btn btn-primary w-full">
                    <Plus size={15} /> {ttSaving ? 'Adding...' : 'Add Period'}
                  </button>
                </div>
              </div>
            </div>

            {/* Timetable grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {timetableForClass.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Clock size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No periods yet. Add the first one above.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {DAYS.map((day, di) => {
                    const periods = timetableForClass.filter(t => String(t.dayOfWeek) === String(di + 1));
                    if (periods.length === 0) return null;
                    return (
                      <div key={di}>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 py-1.5">{day}</div>
                        <div className="space-y-1">
                          {periods.map((t: any) => {
                            const sub = (subjectsData as any[]).find(s => s.id === t.subjectId);
                            const teacher = (staffData as any[]).find(s => s.id === t.teacherId);
                            return (
                              <div key={t.id} className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600">
                                <div className="w-20 text-xs font-mono text-slate-500 shrink-0">{t.startTime}–{t.endTime}</div>
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-slate-800 dark:text-white text-sm">{sub?.name || '—'}</span>
                                  {teacher && <span className="text-xs text-slate-400 ml-2">{teacher.firstName} {teacher.lastName}</span>}
                                </div>
                                <button onClick={() => handleDeleteTimetable(t.id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end shrink-0">
              <button onClick={() => setShowTimetable(false)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Classes</h2>
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
                      <Download size={14} /> Download Template
                    </button>
                  </div>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer text-center"
                    onClick={() => fileInputRef.current?.click()}>
                    <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload Excel file (.xlsx)</p>
                    <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-2 text-sm">Expected Fields:</h4>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {classExpectedFields.map(field => (
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
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">File Column</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Sample</th>
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
                                      Object.keys(next).forEach(k => { if (next[k] === header) delete next[k]; });
                                      if (newKey) next[newKey] = header;
                                      return next;
                                    });
                                  }}
                                  className="w-full form-input py-1 px-2 text-xs"
                                >
                                  <option value="">Skip</option>
                                  {classExpectedFields.map(f => (
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
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={closeImportModal} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={processMapping} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">Preview <ArrowRight size={14} /></button>
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
                    <p className="text-sm text-emerald-700 dark:text-emerald-300"><strong>{importPreview.length}</strong> classes ready to import</p>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Level</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.slice(0, 5).map((classItem, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{(classItem as any).name || '-'}</td>
                            <td className="px-2 py-1.5">{(classItem as any).level || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.length > 5 && (
                      <div className="p-2 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-700/50">... and {importPreview.length - 5} more</div>
                    )}
                  </div>
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm" disabled={isImporting}>Back</button>
                    <button onClick={executeImport} disabled={isImporting} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-70">
                      {isImporting ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing {importProgress}%</> : <><Check size={14} /> Import {importPreview.length}</>}
                    </button>
                  </div>
                  {isImporting && (
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-2">
                      <div className="bg-primary-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

