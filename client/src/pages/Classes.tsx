import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Edit, Trash2, Users, BookOpen, GraduationCap, Download, Upload, FileText, ChevronDown, X, ArrowRight, Check, Trash } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Class } from '@schofy/shared';
import { generateUUID } from '../utils/uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { addToRecycleBin } from '../utils/recycleBin';

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
  const [classes, setClasses] = useState<Class[]>([]);
  const [classEnrollmentCounts, setClassEnrollmentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [formData, setFormData] = useState({ name: '', level: 1, stream: '', capacity: 40 });
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Class>[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);

  const classExpectedFields = [
    { key: 'name', label: 'Class Name', required: true },
    { key: 'level', label: 'Level', required: true },
    { key: 'stream', label: 'Stream', required: false },
    { key: 'capacity', label: 'Capacity', required: false },
  ];

  const loadClasses = useCallback(async () => {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const [data, students] = await Promise.all([
        dataService.getAll(id, 'classes'),
        dataService.getAll(id, 'students'),
      ]);
      const sorted = data.sort((a: any, b: any) => a.level - b.level);
      setClasses(sorted);
      setClassEnrollmentCounts(
        students
          .filter((student: any) => student.status !== 'completed')
          .reduce<Record<string, number>>((counts: Record<string, number>, student: any) => {
            counts[student.classId] = (counts[student.classId] || 0) + 1;
            return counts;
          }, {}),
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, schoolId]);

  useEffect(() => { 
    if (user?.id || schoolId) loadClasses(); 
  }, [user?.id, schoolId, loadClasses]);

  useEffect(() => {
    function handleStudentsUpdated() {
      loadClasses();
    }
    window.addEventListener('studentsUpdated', handleStudentsUpdated);
    window.addEventListener('dataRefresh', loadClasses);
    return () => {
      window.removeEventListener('studentsUpdated', handleStudentsUpdated);
      window.removeEventListener('dataRefresh', loadClasses);
    };
  }, [loadClasses]);

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
    if (!confirm(`Are you sure you want to delete ${selectedClasses.size} class(es)?`)) return;
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
      
      setClasses(prev => prev.filter(c => !selectedClasses.has(c.id)));
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
        setClasses(prev => prev.map(c => c.id === editingClass.id ? { ...c, ...formData } : c));
        addToast('Class updated successfully', 'success');
      } else {
        const newClass: Class = { id: generateUUID(), schoolId: id, name: formData.name, level: formData.level, stream: formData.stream, capacity: formData.capacity, createdAt: now };
        await dataService.create(id, 'classes', newClass);
        setClasses(prev => [...prev, newClass]);
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
    if (confirm('Delete this class?')) {
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
        
        setClasses(prev => prev.filter(c => c.id !== id));
        addToast('Class moved to recycle bin', 'success');
      } catch (error) {
        addToast('Failed to delete', 'error');
      }
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
    const headers = classExpectedFields.map(f => f.label);
    const sampleRow = ['Primary 1', '1', '', '40'];
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'class-import-template.csv';
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
      classExpectedFields.forEach(field => {
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
    try {
      const now = new Date().toISOString();
      let successCount = 0;
      for (const data of importPreview) {
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
      }
      await loadClasses();
      addToast(`Successfully imported ${successCount} classes`, 'success');
      closeImportModal();
    } catch (error) { addToast('Failed to import classes', 'error'); }
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
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".csv" className="hidden" />
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
        <div className="card border-2 border-emerald-200 dark:border-emerald-800">
          <div className="card-header bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20">
            <h3 className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <GraduationCap size={20} />
              {editingClass ? 'Edit Class' : 'Add New Class'}
            </h3>
          </div>
          <form onSubmit={handleSubmit} className="card-body grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="form-label">Class Name</label>
              <input 
                value={formData.name} 
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                className="form-input" 
                required 
                placeholder="Primary 1" 
              />
            </div>
            <div className="space-y-2">
              <label className="form-label">Level</label>
              <input 
                type="number" 
                value={formData.level} 
                onChange={e => setFormData(prev => ({ ...prev, level: parseInt(e.target.value) }))} 
                className="form-input" 
                min="1" 
              />
            </div>
            <div className="space-y-2">
              <label className="form-label">Stream</label>
              <input 
                value={formData.stream} 
                onChange={e => setFormData(prev => ({ ...prev, stream: e.target.value }))} 
                className="form-input" 
                placeholder="A, B, C..." 
              />
            </div>
            <div className="space-y-2">
              <label className="form-label">Capacity</label>
              <input 
                type="number" 
                value={formData.capacity} 
                onChange={e => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) }))} 
                className="form-input" 
              />
            </div>
            <div className="md:col-span-4 flex gap-2">
              <button type="submit" className="btn btn-primary">
                <GraduationCap size={16} /> {editingClass ? 'Update' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full card p-12 text-center">
            <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-500 mt-4">Loading classes...</p>
          </div>
        ) : classes.length === 0 ? (
          <div className="col-span-full card p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700">
            <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <GraduationCap size={40} className="text-emerald-400" />
            </div>
            <p className="text-slate-500 font-medium mt-4">No classes yet</p>
            <p className="text-slate-400 text-sm mt-1">Add your first class to get started</p>
            <button 
              onClick={() => { 
                setShowForm(true); 
                setEditingClass(null); 
                setFormData({ name: '', level: 1, stream: '', capacity: 40 }); 
              }} 
              className="btn btn-primary mt-4"
            >
              <Plus size={16} /> Add Class
            </button>
          </div>
        ) : classes.map((c, index) => {
          const colors = getClassColor(index);
          const isSelected = selectedClasses.has(c.id);
          const enrolled = classEnrollmentCounts[c.id] || 0;
          return (
            <div 
              key={c.id} 
              id={`class-card-${c.id}`}
              className={`card ${colors.card} cursor-pointer transition-all ${isSelected ? 'ring-2 ring-indigo-500 dark:ring-indigo-400' : ''}`}
              onClick={() => handleRowClick(c.id)}
              onDoubleClick={() => { document.getElementById(`class-card-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); handleEdit(c); }}
            >
              <div className="p-5">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-start gap-3">
                    {selectMode && (
                      <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors mt-1 ${
                        isSelected 
                          ? 'bg-primary-600 border-primary-600' 
                          : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                    )}
                    {!selectMode && (
                      <span className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-400 mt-1">
                        {index + 1}
                      </span>
                    )}
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg`}>
                      <GraduationCap size={24} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white">{c.name}</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Level {c.level} {c.stream && <span className="badge badge-info ml-1">Stream {c.stream}</span>}
                      </p>
                    </div>
                  </div>
                  {!selectMode && (
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); document.getElementById(`class-card-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => handleEdit(c), 300); }} className="p-2 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-600 rounded-lg transition-colors">
                        <Edit size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">
                      <Users size={14} className="inline mr-1" />
                      {enrolled}/{c.capacity} students
                    </span>
                    <span className={`text-xs font-medium ${enrolled >= c.capacity ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {Math.max(0, c.capacity - enrolled)} slots left
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
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

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
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
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload CSV file</p>
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
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {classExpectedFields.filter(f => f.required).map(field => (
                          <tr key={field.key}>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">{field.label}*</td>
                            <td className="px-2 py-1.5">
                              <select value={fieldMapping[field.key] || ''} onChange={(e) => setFieldMapping(prev => ({ ...prev, [field.key]: e.target.value }))} className="w-full form-input py-1 px-2 text-xs">
                                <option value="">-- Skip --</option>
                                {csvHeaders.map(header => (<option key={header} value={header}>{header}</option>))}
                              </select>
                            </td>
                          </tr>
                        ))}
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
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm">Back</button>
                    <button onClick={executeImport} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1"><Check size={14} /> Import {importPreview.length}</button>
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
