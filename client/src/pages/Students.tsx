import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, Edit, Trash2, Eye, UserX, Users, Download, Upload, FileText, ChevronDown, X, ArrowRight, Check, Square, CheckSquare, UserCheck, UserMinus, GraduationCap, Filter, Mail, Award } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import type { Class, Student } from '@schofy/shared';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { Gender } from '@schofy/shared';
import ImageModal from '../components/ImageModal';
import { useStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { getClassDisplayName, validateStudentClassAssignments, fixInvalidClassAssignments } from '../utils/classroom';
import { addToRecycleBin } from '../utils/recycleBin';
import { generateUUID } from '../utils/uuid';
import { useTableData } from '../lib/store';

const avatarColors = [
  'bg-rose-500',
  'bg-teal-500',
  'bg-violet-500',
  'bg-lime-500',
  'bg-pink-500',
  'bg-sky-500',
  'bg-amber-500',
];

function getAvatarColor(name: string) {
  const index = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[index];
}

const expectedFields = [
  { key: 'firstName', label: 'First Name', required: true },
  { key: 'lastName', label: 'Last Name', required: true },
  { key: 'gender', label: 'Gender (male/female)', required: true },
  { key: 'dob', label: 'Date of Birth (YYYY-MM-DD)', required: false },
  { key: 'classId', label: 'Class', required: true },
  { key: 'address', label: 'Address', required: false },
  { key: 'guardianName', label: 'Guardian Name', required: false },
  { key: 'guardianPhone', label: 'Guardian Phone', required: false },
  { key: 'guardianEmail', label: 'Guardian Email', required: false },
];

function generateStudentId(firstName: string, lastName: string): string {
  const fn = (firstName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  const ln = (lastName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  const digits = Math.floor(100 + Math.random() * 900);
  return `${fn}${ln}${digits}`;
}

export default function Students() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  // All students from store — always up to date, used for stats cards
  const { data: allStudentsData } = useTableData(sid, 'students');
  const allStudents = allStudentsData as Student[];

  const { loadPage, searchStudents } = useStudents();
  const [students, setStudents] = useState<Student[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClass, setSelectedClass] = useState('');
  const itemsPerPage = 10;
  const { addToast } = useToast();
  // ... rest of state stays same
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Student>[]>([]);
  const [flaggedItems, setFlaggedItems] = useState<Record<number, { action: 'skip' | 'duplicate' | 'replace'; existingId?: string; existingStudent?: Partial<Student> }>>({});
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'active' | 'deactivated' | 'completed'>('active');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showClassFilter, setShowClassFilter] = useState(false);
  const [completedYearFilter, setCompletedYearFilter] = useState<string>('');
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const classFilterRef = useRef<HTMLDivElement>(null);
  const isReloadingRef = useRef(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadClasses = useCallback(async () => {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const classesData = await dataService.getAll(id, 'classes');
      setClasses(classesData);
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  }, [user?.id]);

  const loadData = useCallback(async () => {
    const id = schoolId || user?.id;
    if (!id) return;
    setLoading(true);
    try {
      // Load classes first
      await loadClasses();
      
      if (debouncedSearch) {
        const results = await searchStudents(debouncedSearch);
        // Apply class and view filters to search results
        const filtered = results.filter(student => {
          const matchesClass = !selectedClass || student.classId === selectedClass;
          const matchesView = viewFilter === 'all' || student.status === viewFilter || (viewFilter === 'deactivated' && student.status === 'inactive');
          return matchesClass && matchesView;
        });
        setStudents(filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));
        setTotalCount(filtered.length);
      } else {
        const filter = (student: Student) => {
          const matchesClass = !selectedClass || student.classId === selectedClass;
          const matchesView = viewFilter === 'all' || student.status === viewFilter || (viewFilter === 'deactivated' && student.status === 'inactive');
          return matchesClass && matchesView;
        };
        const { items, total } = await loadPage(currentPage, itemsPerPage, filter);
        setStudents(items);
        setTotalCount(total);
      }
    } catch (error) {
      console.error('Failed to load students:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, schoolId, debouncedSearch, selectedClass, viewFilter, currentPage, loadPage, searchStudents, loadClasses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const availableClassIds = Array.from(new Set([
    ...classes.map((classItem) => classItem.id),
    ...students.map((student) => student.classId).filter(Boolean),
  ]));

  const getCompletedStudents = () => {
    return students.filter(s => s.status === 'completed').sort((a, b) => {
      const completedA = (a as any).completedYear || currentYear;
      const completedB = (b as any).completedYear || currentYear;
      return completedB - completedA;
    });
  };

  const getGroupedCompletedStudents = () => {
    const completed = getCompletedStudents().filter(s => 
      !completedYearFilter || (s as any).completedYear?.toString() === completedYearFilter
    );
    
    const grouped: Record<string, { year: number; students: typeof completed }> = {};
    
    completed.forEach(student => {
      const year = (student as any).completedYear || currentYear;
      const term = (student as any).completedTerm || 'Final';
      const classId = student.classId || 'Unknown';
      const key = `${year}-${term}-${classId}`;
      
      if (!grouped[key]) {
        grouped[key] = { 
          year, 
          students: [] 
        };
      }
      grouped[key].students.push(student);
    });
    
    return Object.values(grouped).sort((a, b) => b.year - a.year);
  };

  useEffect(() => {
    if (selectMode) {
      setShowSelectionBar(true);
    } else {
      const timer = setTimeout(() => setShowSelectionBar(false), 350);
      return () => clearTimeout(timer);
    }
  }, [selectMode]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectMode) {
        setSelectMode(false);
        setSelectedStudents(new Set());
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectMode]);

  // Real-time updates for classes - with debounce to prevent infinite loops
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    
    const handleClassesUpdated = () => {
      if (isReloadingRef.current) return;
      console.log('🔄 Classes updated, reloading...');
      isReloadingRef.current = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadClasses().finally(() => {
          isReloadingRef.current = false;
        });
      }, 100);
    };
    const handleClassesDataChanged = () => {
      if (isReloadingRef.current) return;
      console.log('🔄 Classes data changed, reloading students...');
      isReloadingRef.current = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        await loadClasses();
        await loadData();
        isReloadingRef.current = false;
      }, 100);
    };
    const handleDataRefresh = () => {
      if (isReloadingRef.current) return;
      console.log('🔄 General data refresh, reloading classes...');
      isReloadingRef.current = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadClasses().finally(() => {
          isReloadingRef.current = false;
        });
      }, 100);
    };
    
    window.addEventListener('classesUpdated', handleClassesUpdated);
    window.addEventListener('ClassesUpdated', handleClassesUpdated);
    window.addEventListener('classesDataChanged', handleClassesDataChanged);
    
    return () => {
      window.removeEventListener('classesUpdated', handleClassesUpdated);
      window.removeEventListener('ClassesUpdated', handleClassesUpdated);
      window.removeEventListener('classesDataChanged', handleClassesDataChanged);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [loadClasses, loadData]);

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const paginatedStudents = students;

  async function cleanupOrphanedRecords() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      addToast('Cleaning up orphaned records...', 'info');
      const allStudents = await dataService.getAll(id, 'students');
      const studentIds = new Set(allStudents.map((s: any) => s.id));
      let cleanedCount = 0;
      
      const tablesToCheck = ['fees', 'payments', 'invoices', 'bursaries', 'transportAssignments', 'examResults'];
      
      for (const table of tablesToCheck) {
        const records = await dataService.getAll(id, table);
        const orphanedIds = records
          .filter(r => r.studentId && !studentIds.has(r.studentId))
          .map(r => r.id);
        
        if (orphanedIds.length > 0) {
          await dataService.batchDelete(id, table, orphanedIds);
          cleanedCount += orphanedIds.length;
        }
      }
      
      const attendanceRecords = await dataService.getAll(id, 'attendance');
      const orphanedAttendanceIds = attendanceRecords
        .filter(r => r.entityType === 'student' && r.entityId && !studentIds.has(r.entityId))
        .map(r => r.id);
      
      if (orphanedAttendanceIds.length > 0) {
        await dataService.batchDelete(id, 'attendance', orphanedAttendanceIds);
        cleanedCount += orphanedAttendanceIds.length;
      }
      
      if (cleanedCount > 0) {
        addToast(`Cleaned up ${cleanedCount} orphaned records`, 'success');
      } else {
        addToast('No orphaned records found', 'info');
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      addToast('Failed to cleanup records', 'error');
    }
  }

  async function checkClassAssignments() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      addToast('Checking class assignments...', 'info');
      const validation = await validateStudentClassAssignments(id);
      
      if (validation.invalidAssignments > 0) {
        const confirmFix = confirm(
          `Found ${validation.invalidAssignments} students with invalid class assignments.\n\n` +
          `These students are assigned to classes that don't exist.\n` +
          `Would you like to mark them as "Not assigned"?`
        );
        
        if (confirmFix) {
          const result = await fixInvalidClassAssignments(id);
          addToast(result.message, result.fixed > 0 ? 'success' : 'info');
          await loadData(); // Reload to show updated class names
        }
      } else {
        addToast('All class assignments are valid', 'success');
      }
    } catch (error) {
      console.error('Class assignment check error:', error);
      addToast('Failed to check class assignments', 'error');
    }
  }

  async function handleDelete(id: string) {
    const authId = schoolId || user?.id;
    if (!authId) return;
    if (!confirm('Are you sure you want to delete this student? This action cannot be undone.')) {
      return;
    }
    
    try {
      const student = students.find(s => s.id === id);
      
      // Delete the student directly - related records will be handled by sync
      const result = await dataService.delete(authId, 'students', id);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete');
      }
      
      // Update local state
      setStudents(prev => prev.filter(s => s.id !== id));
      setTotalCount(prev => prev - 1);
      
      // Add to recycle bin
      if (student) {
        try {
          const recycleItem = {
            id: `student-${Date.now()}`,
            type: 'student' as const,
            name: `${student.firstName} ${student.lastName}`,
            data: student,
            deletedAt: new Date().toISOString()
          };
          addToRecycleBin(authId, recycleItem);
        } catch (e) {
          console.error('Recycle bin error:', e);
        }
      }
      
      addToast('Student deleted', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      addToast('Failed to delete student', 'error');
    }
  }

  async function handleToggleStatus(student: Student) {
    const id = schoolId || user?.id;
    if (!id) return;
    const newStatus = student.status === 'active' ? 'inactive' : 'active';
    try {
      await dataService.update(id, 'students', student.id, { status: newStatus } as any);
      addToast(`Student ${newStatus === 'active' ? 'activated' : 'deactivated'}`, 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  function handleRowSingleClick(studentId: string) {
    if (selectMode) {
      setSelectedStudents(prev => {
        const newSet = new Set(prev);
        if (newSet.has(studentId)) {
          newSet.delete(studentId);
        } else {
          newSet.add(studentId);
        }
        return newSet;
      });
    } else {
      navigate(`/students/${studentId}`);
    }
  }

  function handleRowDoubleClick(studentId: string) {
    setSelectMode(true);
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  }

  async function handleMarkCompleted(studentId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const completedData = {
        status: 'completed' as const,
        updatedAt: new Date().toISOString(),
        completedYear: new Date().getFullYear(),
        completedTerm: 'Final'
      };
      await dataService.update(id, 'students', studentId, completedData as any);
      addToast('Student marked as completed', 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleMarkActive(studentId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      await dataService.update(id, 'students', studentId, { status: 'active' } as any);
      addToast('Student reactivated', 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleSendEmail(studentId: string) {
    const student = students.find(s => s.id === studentId);
    if (student?.guardianEmail) {
      window.open(`mailto:${student.guardianEmail}`, '_blank');
    } else {
      addToast('No guardian email available', 'warning');
    }
  }

  function handleSelectAll() {
    if (selectedStudents.size === paginatedStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(paginatedStudents.map(s => s.id)));
    }
  }

  async function handleBulkDelete() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedStudents.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedStudents.size} student(s)? This action cannot be undone.`)) return;
    
    try {
      const now = new Date().toISOString();
      let deletedCount = 0;
      
      for (const studentId of selectedStudents) {
        const student = students.find(s => s.id === studentId);
        const result = await dataService.delete(id, 'students', studentId);
        
        if (result.success && student) {
          deletedCount++;
          addToRecycleBin(id, {
            id: `student-${Date.now()}-${Math.random()}`,
            type: 'student',
            name: `${student.firstName} ${student.lastName}`,
            data: student,
            deletedAt: now
          });
        }
      }
      
      if (deletedCount > 0) {
        window.dispatchEvent(new Event('studentsUpdated'));
      }
      
      setSelectedStudents(new Set());
      setSelectMode(false);
      addToast(`${deletedCount} students deleted`, 'success');
    } catch (error) {
      console.error('Bulk delete error:', error);
      addToast('Failed to delete students', 'error');
    }
  }

  async function handleBulkMarkCompleted() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedStudents.size === 0) return;
    
    try {
      const now = new Date().toISOString();
      const completedData = {
        status: 'completed' as const,
        updatedAt: now,
        completedYear: new Date().getFullYear(),
        completedTerm: 'Final'
      };
      
      for (const studentId of selectedStudents) {
        await dataService.update(id, 'students', studentId, completedData as any);
      }
      
      setSelectedStudents(new Set());
      setSelectMode(false);
      addToast(`${selectedStudents.size} students marked as completed`, 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleBulkDeactivate() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedStudents.size === 0) return;
    
    try {
      const now = new Date().toISOString();
      
      for (const studentId of selectedStudents) {
        await dataService.update(id, 'students', studentId, { status: 'inactive', updatedAt: now } as any);
      }
      
      setSelectedStudents(new Set());
      setSelectMode(false);
      addToast(`${selectedStudents.size} students deactivated`, 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleBulkMarkActive() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedStudents.size === 0) return;
    
    try {
      const now = new Date().toISOString();
      
      for (const studentId of selectedStudents) {
        await dataService.update(id, 'students', studentId, { status: 'active', updatedAt: now } as any);
      }
      
      setSelectedStudents(new Set());
      setSelectMode(false);
      addToast(`${selectedStudents.size} students reactivated`, 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  const handleBulkActivate = handleBulkMarkActive;

  function handleBulkSendEmail() {
    const selectedList = students.filter(s => selectedStudents.has(s.id) && s.guardianEmail);
    if (selectedList.length === 0) {
      addToast('No students with guardian email selected', 'warning');
      return;
    }
    
    const emails = selectedList.map(s => s.guardianEmail).join(',');
    window.open(`mailto:${emails}`, '_blank');
  }

  const studentCSVColumns = [
    { key: 'studentId' as keyof Student, label: 'Student ID' },
    { key: 'firstName' as keyof Student, label: 'First Name' },
    { key: 'lastName' as keyof Student, label: 'Last Name' },
    { key: 'dob' as keyof Student, label: 'Date of Birth' },
    { key: 'gender' as keyof Student, label: 'Gender' },
    { key: 'classId' as keyof Student, label: 'Class' },
    { key: 'address' as keyof Student, label: 'Address' },
    { key: 'guardianName' as keyof Student, label: 'Guardian Name' },
    { key: 'guardianPhone' as keyof Student, label: 'Guardian Phone' },
    { key: 'guardianEmail' as keyof Student, label: 'Guardian Email' },
  ];

  const studentPDFColumns = [
    { key: 'studentId', label: 'Student ID' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'classId', label: 'Class' },
    { key: 'gender', label: 'Gender' },
    { key: 'guardianName', label: 'Guardian' },
    { key: 'guardianPhone', label: 'Phone' },
    { key: 'status', label: 'Status' },
  ];

  function getStudentsByFilter() {
    switch (viewFilter) {
      case 'active':
        return students.filter(s => s.status === 'active');
      case 'deactivated':
        return students.filter(s => s.status === 'inactive');
      case 'completed':
        return students.filter(s => s.status === 'completed');
      default:
        return students.filter(s => s.status !== 'completed');
    }
  }

  function getExportLabel() {
    switch (viewFilter) {
      case 'active': return 'Active Students';
      case 'deactivated': return 'Deactivated Students';
      case 'completed': return 'School Records';
      default: return 'Students';
    }
  }

  function handleExportCSV() {
    const data = getStudentsByFilter();
    exportToCSV(data, getExportLabel().toLowerCase().replace(/\s+/g, '-'), studentCSVColumns);
    addToast(`${getExportLabel()} exported to CSV`, 'success');
  }

  function handleExportPDF() {
    const data = getStudentsByFilter();
    exportToPDF(`${getExportLabel()} Report`, data, studentPDFColumns, 'students');
    addToast(`${getExportLabel()} exported to PDF`, 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    const data = getStudentsByFilter();
    exportToExcel(data, getExportLabel().toLowerCase().replace(/\s+/g, '-'), studentCSVColumns);
    addToast(`${getExportLabel()} exported to Excel`, 'success');
    setShowExportMenu(false);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setShowStatusFilter(false);
      }
      if (classFilterRef.current && !classFilterRef.current.contains(event.target as Node)) {
        setShowClassFilter(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function downloadTemplate() {
    const headers = expectedFields.map(f => f.label);
    const sampleRow = expectedFields.map(f => {
      switch (f.key) {
        case 'studentId': return 'JODO123';
        case 'firstName': return 'John';
        case 'lastName': return 'Doe';
        case 'gender': return 'male';
        case 'dob': return '2010-01-15';
        case 'classId': return 'primary-1';
        case 'address': return '123 Main Street';
        case 'guardianName': return 'Jane Doe';
        case 'guardianPhone': return '0771234567';
        case 'guardianEmail': return 'jane@example.com';
        default: return '';
      }
    });
    
    const csv = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'student-import-template.csv';
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
    setPlanLimitMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        addToast('CSV file must have headers and at least one data row', 'error');
        return;
      }

      const headers = parseCSVHeaders(lines[0]);
      const data = lines.slice(1).map(line => parseCSVLine(line));
      
      setCsvHeaders(headers);
      setCsvData(data);
      
      const autoMapping: Record<string, string> = {};
      expectedFields.forEach(field => {
        const matchingHeader = headers.find(h => 
          h.toLowerCase() === field.label.toLowerCase() ||
          h.toLowerCase() === field.key.toLowerCase() ||
          h.toLowerCase().includes(field.key.toLowerCase()) ||
          field.label.toLowerCase().includes(h.toLowerCase())
        );
        if (matchingHeader) {
          autoMapping[field.key] = matchingHeader;
        }
      });
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) {
      console.error('File read error:', error);
      addToast('Failed to read CSV file', 'error');
    }

    event.target.value = '';
  }

  function parseCSVHeaders(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  function processMapping() {
    const mappedData: Partial<Student>[] = [];
    const newFlaggedItems: Record<number, { action: 'skip' | 'duplicate' | 'replace'; existingId?: string; existingStudent?: Partial<Student> }> = {};
    
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const student: Partial<Student> = {};
      
      expectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            (student as any)[field.key] = row[headerIndex];
          }
        }
      });
      
      if (student.firstName || student.lastName) {
        const fn = (student.firstName as string) || '';
        const ln = (student.lastName as string) || '';
        const generatedId = generateStudentId(fn, ln);
        
        (student as any).id = generatedId;
        
        const existingStudent = students.find(s => 
          s.firstName.toLowerCase() === fn.toLowerCase() && 
          s.lastName.toLowerCase() === ln.toLowerCase()
        );
        
        if (existingStudent) {
          newFlaggedItems[i] = {
            action: 'skip',
            existingId: existingStudent.id,
            existingStudent: existingStudent
          };
        }
        
        mappedData.push(student);
      }
    }
    
    setImportPreview(mappedData);
    setFlaggedItems(newFlaggedItems);
    setPlanLimitMessage(null);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (importPreview.length === 0 || !id) {
      addToast('No valid students to import', 'error');
      return;
    }

    try {
      const now = new Date().toISOString();
      let successCount = 0;
      let skippedCount = 0;
      let replacedCount = 0;

      const getImportStatus = () => {
        switch (viewFilter) {
          case 'active': return 'active';
          case 'deactivated': return 'inactive';
          case 'completed': return 'completed';
          default: return 'active';
        }
      };

      const importStatus = getImportStatus();

      for (let i = 0; i < importPreview.length; i++) {
        const data = importPreview[i];
        const studentId = (data as any).id;
        const flagged = flaggedItems[i];

        if (flagged) {
          if (flagged.action === 'skip') {
            skippedCount++;
            continue;
          } else if (flagged.action === 'duplicate') {
            let newId = studentId;
            let counter = 1;
            while (students.find(s => s.id === newId)) {
              const fn = ((data as any).firstName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
              const ln = ((data as any).lastName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
              newId = `${fn}${ln}${100 + counter}`;
              counter++;
            }
            
            const genderValue = ((data as any).gender as string)?.toLowerCase();
            const validGender = genderValue === 'female' ? Gender.FEMALE : genderValue === 'other' ? Gender.OTHER : Gender.MALE;
            
            const student: Student = {
              id: newId,
              schoolId: id,
              studentId: newId,
              admissionNo: newId,
              firstName: ((data as any).firstName as string) || 'Unknown',
              lastName: ((data as any).lastName as string) || 'Unknown',
              dob: ((data as any).dob as string) || '2000-01-01',
              gender: validGender,
              classId: ((data as any).classId as string) || 'primary-1',
              address: ((data as any).address as string) || '',
              guardianName: ((data as any).guardianName as string) || '',
              guardianPhone: ((data as any).guardianPhone as string) || '',
              guardianEmail: (data as any).guardianEmail as string | undefined,
              status: importStatus as any,
              completedYear: importStatus === 'completed' ? new Date().getFullYear() : undefined,
              completedTerm: importStatus === 'completed' ? 'Final' : undefined,
              createdAt: now,
              updatedAt: now,
            };
            
            await dataService.create(id, 'students', student);
            successCount++;
          } else if (flagged.action === 'replace' && flagged.existingId) {
            const genderValue = ((data as any).gender as string)?.toLowerCase();
            const validGender = genderValue === 'female' ? Gender.FEMALE : genderValue === 'other' ? Gender.OTHER : Gender.MALE;
            
            await dataService.update(id, 'students', flagged.existingId, {
              firstName: ((data as any).firstName as string) || 'Unknown',
              lastName: ((data as any).lastName as string) || 'Unknown',
              dob: ((data as any).dob as string) || '2000-01-01',
              gender: validGender,
              classId: ((data as any).classId as string) || 'primary-1',
              address: ((data as any).address as string) || '',
              guardianName: ((data as any).guardianName as string) || '',
              guardianPhone: ((data as any).guardianPhone as string) || '',
              guardianEmail: (data as any).guardianEmail as string | undefined,
              status: importStatus as any,
              completedYear: importStatus === 'completed' ? new Date().getFullYear() : undefined,
              completedTerm: importStatus === 'completed' ? 'Final' : undefined,
              updatedAt: now,
            } as any);
            replacedCount++;
          }
        } else {
          // Regular new student
          const genderValue = ((data as any).gender as string)?.toLowerCase();
          const validGender = genderValue === 'female' ? Gender.FEMALE : genderValue === 'other' ? Gender.OTHER : Gender.MALE;

          const studentIdLocal = (data as any).id || generateUUID();

          const student: Student = {
            id: studentIdLocal,
            schoolId: id,
            studentId: (data as any).studentId || generateStudentId((data.firstName as string) || '', (data.lastName as string) || ''),
            admissionNo: (data as any).admissionNo || studentIdLocal,
            firstName: (data.firstName as string) || 'Unknown',
            lastName: (data.lastName as string) || 'Unknown',
            gender: validGender,
            dob: (data.dob as string) || '2000-01-01',
            classId: (data.classId as string) || 'primary-1',
            address: (data.address as string) || '',
            guardianName: (data.guardianName as string) || '',
            guardianPhone: (data.guardianPhone as string) || '',
            guardianEmail: data.guardianEmail as string | undefined,
            status: importStatus as any,
            completedYear: importStatus === 'completed' ? new Date().getFullYear() : undefined,
            completedTerm: importStatus === 'completed' ? 'Final' : undefined,
            createdAt: now,
            updatedAt: now,
          };
          
          await dataService.create(id, 'students', student as any);
          successCount++;
        }
      }

      const parts: string[] = [];
      if (successCount > 0) parts.push(`${successCount} imported`);
      if (replacedCount > 0) parts.push(`${replacedCount} replaced`);
      if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
      
      addToast(parts.join(', ') || 'Import complete', 'success');
      closeImportModal();
    } catch (error) {
      console.error('Import error:', error);
      addToast('Failed to import students', 'error');
    }
  }

  // Stats use ALL students (not just current page) — always accurate
  const activeCount = allStudents.filter(s => s.status === 'active').length;
  const deactivatedCount = allStudents.filter(s => s.status === 'inactive').length;
  const completedCount = allStudents.filter(s => s.status === 'completed').length;
  const totalEnrolled = allStudents.filter(s => s.status !== 'completed').length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            {viewFilter === 'all' ? 'All Students' : 
             viewFilter === 'active' ? 'Active Students' :
             viewFilter === 'deactivated' ? 'Deactivated Students' :
             'School Records'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {viewFilter === 'all' ? 'Manage all registered students' :
             viewFilter === 'active' ? 'Students with active enrollment' :
             viewFilter === 'deactivated' ? 'Students with inactive status' :
             'Alumni and completed student records'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)} 
              className="btn btn-secondary"
              title="Export"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export {viewFilter === 'all' ? '' : `(${viewFilter === 'completed' ? 'Records' : viewFilter})`}</span>
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden animate-dropdown-in">
                <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  Exporting: {getExportLabel()}
                </div>
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
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" title="Import">
            <Upload size={16} />
            <span className="hidden sm:inline">Import {viewFilter === 'all' ? '' : `(${viewFilter === 'completed' ? 'Records' : viewFilter})`}</span>
          </button>
          <button onClick={checkClassAssignments} className="btn btn-secondary text-blue-600 hover:text-blue-700 dark:text-blue-400" title="Check class assignments">
            <Users size={16} />
            <span className="hidden lg:inline">Check Classes</span>
          </button>
          <button onClick={cleanupOrphanedRecords} className="btn btn-secondary text-amber-600 hover:text-amber-700 dark:text-amber-400" title="Clean orphaned records">
            <Filter size={16} />
            <span className="hidden lg:inline">Cleanup</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".csv"
            className="hidden"
          />
          <Link to="/admission" className="btn btn-primary">
            <Plus size={16} />
            New Admission
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button 
          onClick={() => setViewFilter('all')}
          className={`card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left ${viewFilter === 'all' ? 'ring-4 ring-white/50' : ''}`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Total Students</p>
              <p className="text-2xl font-bold text-white">{totalEnrolled}</p>
            </div>
          </div>
        </button>
        <button 
          onClick={() => setViewFilter('active')}
          className={`card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left ${viewFilter === 'active' ? 'ring-4 ring-white/50' : ''}`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <UserCheck size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Active Students</p>
              <p className="text-2xl font-bold text-white">{activeCount}</p>
            </div>
          </div>
        </button>
        <button 
          onClick={() => setViewFilter('deactivated')}
          className={`card-solid-amber p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left ${viewFilter === 'deactivated' ? 'ring-4 ring-white/50' : ''}`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <UserMinus size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Deactivated</p>
              <p className="text-2xl font-bold text-white">{deactivatedCount}</p>
            </div>
          </div>
        </button>
        <button 
          onClick={() => setViewFilter('completed')}
          className={`card-solid-purple p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left ${viewFilter === 'completed' ? 'ring-4 ring-white/50' : ''}`}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <GraduationCap size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">School Records</p>
              <p className="text-2xl font-bold text-white">{completedCount}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Filter & Table Card */}
      <div className="card">
        <div className="card-header">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                placeholder="Search by name or admission number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status Filter Dropdown */}
              <div className="relative" ref={statusFilterRef}>
                <button
                  onClick={() => { setShowStatusFilter(!showStatusFilter); setShowClassFilter(false); }}
                  className={`btn btn-secondary flex items-center gap-2 ${viewFilter !== 'active' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">
                    {viewFilter === 'all' ? 'All Status' :
                     viewFilter === 'active' ? 'Active' :
                     viewFilter === 'deactivated' ? 'Deactivated' : 'School Records'}
                  </span>
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showStatusFilter ? 'rotate-180' : ''}`} />
                </button>
                {showStatusFilter && (
                  <div 
                    className={`absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden
                      ${showStatusFilter ? 'animate-dropdown-in' : 'animate-dropdown-out'}`}
                    style={{ 
                      animationDuration: '400ms',
                      animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                      animationFillMode: 'forwards'
                    }}
                  >
                    <div className="py-1">
                      <button
                        onClick={() => { setViewFilter('all'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          viewFilter === 'all' 
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' 
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Users size={16} />
                        All Students
                        {viewFilter === 'all' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setViewFilter('active'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          viewFilter === 'active' 
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' 
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <UserCheck size={16} />
                        Active Students
                        {viewFilter === 'active' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setViewFilter('deactivated'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          viewFilter === 'deactivated' 
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' 
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <UserMinus size={16} />
                        Deactivated
                        {viewFilter === 'deactivated' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setViewFilter('completed'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          viewFilter === 'completed' 
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' 
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <GraduationCap size={16} />
                        School Records
                        {viewFilter === 'completed' && <Check size={14} className="ml-auto" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Class Filter Dropdown */}
              <div className="relative" ref={classFilterRef}>
                <button
                  onClick={() => { setShowClassFilter(!showClassFilter); setShowStatusFilter(false); }}
                  className={`btn btn-secondary flex items-center gap-2 ${selectedClass ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
                >
                  <span className="hidden sm:inline">
                    {selectedClass ? getClassDisplayName(selectedClass, classes) : 'All Classes'}
                  </span>
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showClassFilter ? 'rotate-180' : ''}`} />
                </button>
                {showClassFilter && (
                  <div 
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
                    style={{ 
                      animationDuration: '400ms',
                      animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                      animationFillMode: 'forwards'
                    }}
                  >
                    <div className="py-1">
                      <button
                        onClick={() => { setSelectedClass(''); setShowClassFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          selectedClass === '' 
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' 
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span>All Classes</span>
                        {selectedClass === '' && <Check size={14} className="ml-auto" />}
                      </button>
                      {availableClassIds.map(cls => (
                        <button
                          key={cls}
                          onClick={() => { setSelectedClass(cls); setShowClassFilter(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                            selectedClass === cls 
                              ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' 
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          <span>{getClassDisplayName(cls, classes)}</span>
                          {selectedClass === cls && <Check size={14} className="ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          {showSelectionBar && selectedStudents.size > 0 && viewFilter !== 'completed' && (
            <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between overflow-hidden transition-all duration-300 ease-out" style={{ maxHeight: selectMode ? '200px' : '0', opacity: selectMode ? 1 : 0 }}>
              <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium animate-selection-content-in">
                {selectedStudents.size} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap animate-selection-content-in">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {selectedStudents.size === paginatedStudents.length ? 'Deselect All' : 'Select All'}
                </button>
                {viewFilter !== 'deactivated' && (
                  <button
                    onClick={handleBulkMarkCompleted}
                    className="px-3 py-1.5 text-xs bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                  >
                    <Award size={12} />
                    Mark Completed
                  </button>
                )}
                {viewFilter === 'deactivated' ? (
                  <button
                    onClick={handleBulkActivate}
                    className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                  >
                    <UserCheck size={12} />
                    Activate
                  </button>
                ) : (
                  <button
                    onClick={handleBulkDeactivate}
                    className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                  >
                    <UserX size={12} />
                    Deactivate
                  </button>
                )}
                {viewFilter !== 'deactivated' && (
                  <button
                    onClick={handleBulkSendEmail}
                    className="px-3 py-1.5 text-xs bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                  >
                    <Mail size={12} />
                    Send Email
                  </button>
                )}
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
                <button
                  onClick={() => { setSelectedStudents(new Set()); setSelectMode(false); }}
                  className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {showSelectionBar && selectedStudents.size > 0 && viewFilter === 'completed' && (
            <div className="px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800 flex items-center justify-between overflow-hidden transition-all duration-300 ease-out" style={{ maxHeight: selectMode ? '200px' : '0', opacity: selectMode ? 1 : 0 }}>
              <span className="text-sm text-violet-700 dark:text-violet-300 font-medium animate-selection-content-in">
                {selectedStudents.size} selected (School Records)
              </span>
              <div className="flex items-center gap-2 flex-wrap animate-selection-content-in">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  {selectedStudents.size === paginatedStudents.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  onClick={handleBulkMarkActive}
                  className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                >
                  <UserCheck size={12} />
                  Mark Active
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
                <button
                  onClick={() => { setSelectedStudents(new Set()); setSelectMode(false); }}
                  className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {viewFilter === 'completed' && (
            <div className="px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-violet-700 dark:text-violet-300">School Records by Year:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setCompletedYearFilter('')}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${
                      !completedYearFilter 
                        ? 'bg-violet-600 text-white' 
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                    }`}
                  >
                    All Years
                  </button>
                  {years.map(year => (
                    <button
                      key={year}
                      onClick={() => setCompletedYearFilter(year.toString())}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        completedYearFilter === year.toString() 
                          ? 'bg-violet-600 text-white' 
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          {viewFilter !== 'completed' ? (
            <table>
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  {selectMode && <th className="w-10">
                    <button onClick={handleSelectAll} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                      {selectedStudents.size === paginatedStudents.length && paginatedStudents.length > 0 ? (
                        <CheckSquare size={16} className="text-primary-600" />
                      ) : (
                        <Square size={16} className="text-slate-400" />
                      )}
                    </button>
                  </th>}
                  <th>Student</th>
                  <th>Admission No.</th>
                  <th>Class</th>
                  <th>Gender</th>
                  <th>Guardian</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={selectMode ? 9 : 8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm">Loading...</p>
                      </div>
                    </td>
                  </tr>
                ) : paginatedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={selectMode ? 9 : 8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <Users size={24} className="text-slate-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No students found</p>
                        <Link to="/admission" className="text-blue-500 hover:text-blue-600 text-sm font-medium">
                          Add your first student
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedStudents.map((student, index) => (
                    <tr 
                      key={student.id} 
                      className={`group cursor-pointer transition-colors ${selectedStudents.has(student.id) ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                      onClick={() => handleRowSingleClick(student.id)}
                      onDoubleClick={() => handleRowDoubleClick(student.id)}
                    >
                      <td className="text-center text-xs text-slate-400 dark:text-slate-500">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      {selectMode && (
                        <td className="text-center">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            selectedStudents.has(student.id) 
                              ? 'bg-primary-600 border-primary-600' 
                              : 'border-slate-300 dark:border-slate-600'
                          }`}>
                            {selectedStudents.has(student.id) && (
                              <Check size={12} className="text-white" />
                            )}
                          </div>
                        </td>
                      )}
                      <td>
                        <div className="flex items-center gap-3">
                          {student.photoUrl ? (
                            <button 
                              onClick={() => setPreviewImage({ src: student.photoUrl!, alt: `${student.firstName} ${student.lastName}` })}
                              className="w-9 h-9 rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all"
                            >
                              <img 
                                src={student.photoUrl} 
                                alt={`${student.firstName} ${student.lastName}`}
                                className="w-full h-full object-cover object-top"
                              />
                            </button>
                          ) : (
                            <div className={`w-9 h-9 rounded-lg ${getAvatarColor(student.firstName)} flex items-center justify-center`}>
                              <span className="text-xs font-bold text-white">
                                {student.firstName[0]}
                                {student.lastName[0]}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white">
                              {student.firstName} {student.lastName}
                            </p>
                            <p className="text-xs text-slate-400">{student.guardianEmail || 'No guardian email'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded">
                        {student.studentId || student.admissionNo}
                      </td>
                      <td>
                        <span className="badge badge-info">{getClassDisplayName(student.classId, classes)}</span>
                      </td>
                      <td className="capitalize">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                          student.gender === 'male' 
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' 
                            : 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300'
                        }`}>
                          {student.gender}
                        </span>
                      </td>
                      <td>
                        <div>
                          <p className="text-sm font-medium">{student.guardianName}</p>
                          <p className="text-xs text-slate-400">{student.guardianPhone}</p>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${student.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                          {student.status}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Link
                            to={`/students/${student.id}`}
                            className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye size={15} />
                          </Link>
                          <Link
                            to={`/students/${student.id}/edit`}
                            className="p-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit size={15} />
                          </Link>
                          <button
                            onClick={() => handleMarkCompleted(student.id)}
                            className="p-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-lg transition-colors"
                            title="Mark Completed"
                          >
                            <Award size={15} />
                          </button>
                          {student.status === 'active' && (
                            <button
                              onClick={() => handleToggleStatus(student)}
                              className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg transition-colors"
                              title="Deactivate"
                            >
                              <UserX size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => handleSendEmail(student.id)}
                            className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-500 dark:text-sky-400 rounded-lg transition-colors"
                            title="Send Email"
                          >
                            <Mail size={15} />
                          </button>
                          <button
                            onClick={() => handleDelete(student.id)}
                            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <div className="p-4">
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-slate-400 py-12">
                  <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm">Loading school records...</p>
                </div>
              ) : getGroupedCompletedStudents().length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12">
                  <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <GraduationCap size={32} className="text-violet-400" />
                  </div>
                  <p className="text-slate-500 font-medium">No school records found</p>
                  <p className="text-xs text-slate-400">School records will appear here</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {getGroupedCompletedStudents().map((group, groupIndex) => (
                    <div key={groupIndex} className="border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden">
                      <div className="bg-violet-100 dark:bg-violet-900/30 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center">
                            <GraduationCap size={20} className="text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-violet-800 dark:text-violet-200">Class of {group.year}</h3>
                            <p className="text-xs text-violet-600 dark:text-violet-400">{group.students.length} student{group.students.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 text-xs font-medium bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 rounded-full">
                          {getClassDisplayName(group.students[0].classId, classes)}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {group.students.map((student) => (
                          <div 
                            key={student.id}
                            className={`flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors ${selectedStudents.has(student.id) ? 'bg-violet-50 dark:bg-violet-900/20' : ''}`}
                            onClick={() => handleRowSingleClick(student.id)}
                            onDoubleClick={() => handleRowDoubleClick(student.id)}
                          >
                            {selectMode && (
                              <div 
                                onClick={(e) => { e.stopPropagation(); handleRowSingleClick(student.id); }}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                  selectedStudents.has(student.id) 
                                    ? 'bg-violet-600 border-violet-600' 
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}
                              >
                                {selectedStudents.has(student.id) && (
                                  <Check size={12} className="text-white" />
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-3 flex-1">
                              {student.photoUrl ? (
                                <img 
                                  src={student.photoUrl} 
                                  alt={`${student.firstName} ${student.lastName}`}
                                  className="w-10 h-10 rounded-full object-cover object-top"
                                />
                              ) : (
                                <div className={`w-10 h-10 rounded-full ${getAvatarColor(student.firstName)} flex items-center justify-center`}>
                                  <span className="text-sm font-bold text-white">
                                    {student.firstName[0]}{student.lastName[0]}
                                  </span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 dark:text-white truncate">
                                  {student.firstName} {student.lastName}
                                </p>
                                <p className="text-xs text-slate-400">{student.studentId || student.admissionNo}</p>
                              </div>
                            </div>
                            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                              <button
                                onClick={() => handleMarkActive(student.id)}
                                className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors"
                                title="Mark Active"
                              >
                                <UserCheck size={15} />
                              </button>
                              <button
                                onClick={() => handleDelete(student.id)}
                                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {totalPages > 1 && viewFilter !== 'completed' && (
          <div className="p-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-700 dark:text-slate-300">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{totalCount}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary p-2"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1.5 bg-white dark:bg-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn btn-secondary p-2"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      {previewImage && (
        <ImageModal 
          src={previewImage.src} 
          alt={previewImage.alt} 
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">
                  Import {viewFilter === 'completed' ? 'School Records' : viewFilter === 'all' ? 'Students' : viewFilter === 'active' ? 'Active Students' : 'Deactivated Students'}
                </h2>
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
                      {expectedFields.map(field => (
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
                        {expectedFields.filter(f => f.required).map(field => (
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
                <div className="flex flex-col h-[calc(85vh-56px)] -m-5">
                  <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 1</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 2</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3 Review</span>
                    </div>
                    <div className="flex gap-3 ml-auto">
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-1">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                          <strong>{importPreview.length - Object.keys(flaggedItems).length}</strong> new
                        </p>
                      </div>
                      {Object.keys(flaggedItems).length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1">
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            <strong>{Object.keys(flaggedItems).length}</strong> duplicates
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {planLimitMessage && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5 mx-5 mt-3">
                      <p className="text-sm text-red-700 dark:text-red-300">{planLimitMessage}</p>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-700/50 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300 w-12">#</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300">Class</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                          <th className="px-4 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300 w-48">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.map((student, index) => {
                          const flagged = flaggedItems[index];
                          return (
                            <tr key={index} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 ${flagged ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                              <td className="px-4 py-2.5 text-slate-500">{index + 1}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={`w-8 h-8 rounded-full ${getAvatarColor((student as any).firstName)} flex items-center justify-center text-white text-xs font-bold`}>
                                    {((student as any).firstName || '?')[0]}{((student as any).lastName || '?')[0]}
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-800 dark:text-white">{(student as any).firstName} {(student as any).lastName}</p>
                                    <p className="text-[10px] text-slate-400">ID: {(student as any).id}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">{(student as any).classId || '-'}</td>
                              <td className="px-4 py-2.5">
                                {flagged ? (
                                  <div>
                                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
                                      Duplicate
                                    </span>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                      vs: {flagged.existingStudent?.firstName} {flagged.existingStudent?.lastName}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded text-xs font-medium">
                                    New
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {flagged ? (
                                  <select
                                    value={flagged.action}
                                    onChange={(e) => setFlaggedItems(prev => ({
                                      ...prev,
                                      [index]: { ...prev[index], action: e.target.value as 'skip' | 'duplicate' | 'replace' }
                                    }))}
                                    className="form-input py-1 px-2 text-xs w-full"
                                  >
                                    <option value="skip">Skip</option>
                                    <option value="duplicate">Import as New</option>
                                    <option value="replace">Replace Existing</option>
                                  </select>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400 text-xs">Will import</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-2 px-4">Back to Mapping</button>
                    <button onClick={executeImport} className="btn btn-primary py-2 px-4 flex items-center gap-2">
                      <Check size={16} /> Import Selected
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

