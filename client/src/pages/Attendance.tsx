import { useEffect, useState, useRef } from 'react';
import { Check, X, Clock, Save, Calendar, Users, BookOpen, Download, Upload, ChevronDown, FileText, ArrowRight, Check as CheckIcon } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { AttendanceStatus, EntityType } from '@schofy/shared';
import type { Attendance as AttendanceRecord, Student } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { dataService } from '../lib/database/DataService';

const avatarColors = [
  'from-coral-400 to-orange-400',
  'from-teal-400 to-cyan-400',
  'from-violet-400 to-purple-400',
  'from-emerald-400 to-green-400',
  'from-rose-400 to-pink-400',
  'from-sky-400 to-blue-400',
];

function getAvatarColor(name: string) {
  const index = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[index];
}

export default function Attendance() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('primary-1');
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const { user, schoolId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<any[]>([]);

  const attendanceExpectedFields = [
    { key: 'date', label: 'Date', required: true },
    { key: 'admissionNo', label: 'Admission No', required: true },
    { key: 'status', label: 'Status', required: true },
  ];

  useEffect(() => { 
    if (user?.id || schoolId) {
      loadData(); 
    }
  }, [selectedDate, selectedClass, user?.id, schoolId]);

  useEffect(() => {
    const handleAttendanceUpdated = () => loadData();
    const handleDataRefresh = () => loadData();
    
    window.addEventListener('attendanceUpdated', handleAttendanceUpdated);
    window.addEventListener('dataRefresh', handleDataRefresh);
    
    return () => {
      window.removeEventListener('attendanceUpdated', handleAttendanceUpdated);
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadData() {
    const id = schoolId || user?.id;
    if (!id) return;
    setLoading(true);
    try {
      const classStudents = await dataService.where(id, 'students', 'classId', selectedClass);
      const records = await dataService.where(id, 'attendance', 'date', selectedDate);
      const allRecords = await dataService.getAll(id, 'attendance');
      
      setStudents(classStudents);
      setAllAttendance(allRecords);
      
      const attendanceMap: Record<string, AttendanceStatus> = {};
      records.filter((r: any) => r.entityType === EntityType.STUDENT).forEach((r: any) => {
        attendanceMap[r.entityId] = r.status;
      });
      setAttendance(attendanceMap);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function handleStatusChange(studentId: string, status: AttendanceStatus) {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  }

  async function handleSave() {
    const id = schoolId || user?.id;
    if (!id) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      
      const existingRecords = await dataService.where(id, 'attendance', 'date', selectedDate);
      for (const record of existingRecords) {
        if (record.entityType === EntityType.STUDENT && students.some(s => s.id === record.entityId)) {
          await dataService.delete(id, 'attendance', record.id);
        }
      }
      
      const records: AttendanceRecord[] = students.map(s => ({
        id: uuidv4(),
        entityType: EntityType.STUDENT,
        entityId: s.id,
        date: selectedDate,
        status: attendance[s.id] || AttendanceStatus.PRESENT,
        createdAt: now,
      }));
      
      for (const record of records) {
        await dataService.create(id, 'attendance', record as any);
      }
      addToast('Attendance saved successfully', 'success');
      loadData();
    } catch (error) {
      addToast('Failed to save attendance', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    const exportData = allAttendance
      .filter(r => r.entityType === EntityType.STUDENT)
      .map(r => {
        const student = students.find(s => s.id === r.entityId);
        return {
          ...r,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
          admissionNo: student?.admissionNo || 'N/A',
        };
      });
    
    exportToCSV(exportData, 'attendance', [
      { key: 'date' as keyof typeof exportData[0], label: 'Date' },
      { key: 'admissionNo' as keyof typeof exportData[0], label: 'Admission No' },
      { key: 'studentName' as keyof typeof exportData[0], label: 'Student' },
      { key: 'status' as keyof typeof exportData[0], label: 'Status' },
    ]);
    addToast('Attendance exported to CSV', 'success');
    setShowExportMenu(false);
  }

  function handleExportPDF() {
    const exportData = allAttendance
      .filter(r => r.entityType === EntityType.STUDENT)
      .map(r => {
        const student = students.find(s => s.id === r.entityId);
        return {
          ...r,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
          admissionNo: student?.admissionNo || 'N/A',
        };
      });
    
    exportToPDF('Attendance Report', exportData, [
      { key: 'date', label: 'Date' },
      { key: 'admissionNo', label: 'Adm No' },
      { key: 'studentName', label: 'Student' },
      { key: 'status', label: 'Status' },
    ], 'attendance');
    addToast('Attendance exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    const exportData = allAttendance
      .filter(r => r.entityType === EntityType.STUDENT)
      .map(r => {
        const student = students.find(s => s.id === r.entityId);
        return {
          ...r,
          studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
          admissionNo: student?.admissionNo || 'N/A',
        };
      });
    
    exportToExcel(exportData, 'attendance', [
      { key: 'date' as keyof typeof exportData[0], label: 'Date' },
      { key: 'admissionNo' as keyof typeof exportData[0], label: 'Admission No' },
      { key: 'studentName' as keyof typeof exportData[0], label: 'Student' },
      { key: 'status' as keyof typeof exportData[0], label: 'Status' },
    ]);
    addToast('Attendance exported to Excel', 'success');
    setShowExportMenu(false);
  }

  function downloadTemplate() {
    const headers = attendanceExpectedFields.map(f => f.label);
    const sampleRows = [
      ['2024-01-15', 'ADM001', 'present'],
      ['2024-01-15', 'ADM002', 'absent'],
    ];
    const csv = [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'attendance-import-template.csv';
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
      attendanceExpectedFields.forEach(field => {
        const matchingHeader = headers.find(h => h.toLowerCase() === field.label.toLowerCase() || h.toLowerCase().includes(field.key.toLowerCase()));
        if (matchingHeader) autoMapping[field.key] = matchingHeader;
      });
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) { addToast('Failed to read CSV file', 'error'); }
    event.target.value = '';
  }

  function processMapping() {
    const mappedData: { date: string; admissionNo: string; status: string }[] = [];
    for (const row of csvData) {
      const record: any = {};
      attendanceExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            record[field.key] = row[headerIndex];
          }
        }
      });
      if (record.date && record.admissionNo) mappedData.push(record);
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (!id || importPreview.length === 0) { addToast('No valid records to import', 'error'); return; }
    try {
      const now = new Date().toISOString();
      let successCount = 0;

      for (const data of importPreview as any[]) {
        const student = students.find(s => s.admissionNo === data.admissionNo);
        if (!student) continue;

        const existing = await dataService.where(id, 'attendance', 'date', data.date);
        const existingRecord = existing.find((a: any) => a.entityId === student.id);

        if (existingRecord) {
          await dataService.update(id, 'attendance', existingRecord.id, { status: data.status as AttendanceStatus } as any);
        } else {
          const newRecord: AttendanceRecord = {
            id: uuidv4(),
            entityType: EntityType.STUDENT,
            entityId: student.id,
            date: data.date,
            status: data.status as AttendanceStatus,
            createdAt: now,
          };
          await dataService.create(id, 'attendance', newRecord as any);
        }
        successCount++;
      }
      await loadData();
      addToast(`Successfully imported ${successCount} attendance records`, 'success');
      closeImportModal();
    } catch (error) { addToast('Failed to import attendance', 'error'); }
  }

  const presentCount = Object.values(attendance).filter(s => s === AttendanceStatus.PRESENT).length;
  const absentCount = Object.values(attendance).filter(s => s === AttendanceStatus.ABSENT).length;
  const lateCount = Object.values(attendance).filter(s => s === AttendanceStatus.LATE).length;
  const totalMarked = presentCount + absentCount + lateCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Attendance
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Mark and track student attendance</p>
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
            onClick={handleSave} 
            disabled={loading || students.length === 0} 
            className="btn btn-primary shadow-lg shadow-primary-500/25"
          >
            <Save size={18} /> Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Check size={24} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{presentCount}</p>
              <p className="text-xs text-white/80 font-medium">Present</p>
            </div>
          </div>
        </div>
        <div className="card-solid-rose p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <X size={24} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{absentCount}</p>
              <p className="text-xs text-white/80 font-medium">Absent</p>
            </div>
          </div>
        </div>
        <div className="card-solid-violet p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Clock size={24} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{lateCount}</p>
              <p className="text-xs text-white/80 font-medium">Late</p>
            </div>
          </div>
        </div>
        <div className="card-solid-cyan p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalMarked}/{students.length}</p>
              <p className="text-xs text-white/80 font-medium">Marked</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="form-label flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            Select Date
          </label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="form-input" />
        </div>
        <div className="space-y-2">
          <label className="form-label flex items-center gap-2">
            <BookOpen size={16} className="text-slate-400" />
            Select Class
          </label>
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="form-input">
            <option value="primary-1">Primary 1</option>
            <option value="primary-2">Primary 2</option>
            <option value="primary-3">Primary 3</option>
            <option value="jss-1">JSS 1</option>
            <option value="jss-2">JSS 2</option>
            <option value="ss-1">SS 1</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-header bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-400 flex items-center justify-center shadow-md">
              <BookOpen size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Student List</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{selectedClass.toUpperCase()} - {students.length} students</p>
            </div>
          </div>
          {totalMarked > 0 && (
            <div className="text-sm text-slate-500">
              {Math.round((presentCount / totalMarked) * 100)}% present
            </div>
          )}
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Admission No.</th>
                <th className="text-center">Attendance Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
                      <p className="text-slate-500">Loading...</p>
                    </div>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Users size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">No students in this class</p>
                      <p className="text-slate-400 text-sm">Add students to this class to mark attendance</p>
                    </div>
                  </td>
                </tr>
              ) : students.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(s.firstName)} flex items-center justify-center shadow-md`}>
                        <span className="text-sm font-bold text-white">{s.firstName[0]}{s.lastName[0]}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-white">{s.firstName} {s.lastName}</p>
                        <p className="text-xs text-slate-400">{s.guardianEmail || 'No guardian email'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-sm bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-lg">
                    {s.admissionNo}
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleStatusChange(s.id, AttendanceStatus.PRESENT)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                          attendance[s.id] === AttendanceStatus.PRESENT 
                            ? 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/30' 
                            : 'bg-emerald-100 text-emerald-700 hover:from-emerald-200 hover:to-green-200 dark:bg-emerald-900/40 dark:text-emerald-300'
                        }`}
                      >
                        <Check size={16} />
                        Present
                      </button>
                      <button
                        onClick={() => handleStatusChange(s.id, AttendanceStatus.ABSENT)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                          attendance[s.id] === AttendanceStatus.ABSENT 
                            ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/30' 
                            : 'bg-red-100 text-red-700 hover:from-red-200 hover:to-rose-200 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        <X size={16} />
                        Absent
                      </button>
                      <button
                        onClick={() => handleStatusChange(s.id, AttendanceStatus.LATE)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                          attendance[s.id] === AttendanceStatus.LATE 
                            ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-lg shadow-amber-500/30' 
                            : 'bg-amber-100 text-amber-700 hover:from-amber-200 hover:to-yellow-200 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}
                      >
                        <Clock size={16} />
                        Late
                      </button>
                    </div>
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
                <h2 className="font-bold text-white">Import Attendance</h2>
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
                      {attendanceExpectedFields.map(field => (
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
                        {attendanceExpectedFields.filter(f => f.required).map(field => (
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
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 1</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 2</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3</span>
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      <strong>{importPreview.length}</strong> records ready to import
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Date</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {(importPreview as any[]).slice(0, 5).map((record, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{(record as any).date || '-'}</td>
                            <td className="px-2 py-1.5">{(record as any).status || '-'}</td>
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
                      <CheckIcon size={14} /> Import {importPreview.length}
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
