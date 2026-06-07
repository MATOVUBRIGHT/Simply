﻿import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronLeft, ChevronRight, Trash2, UserX, Users, Download, Upload, FileText, ChevronDown, X, ArrowRight, Check, Square, CheckSquare, UserCheck, UserMinus, GraduationCap, Filter, Mail, Award, AlertTriangle, Settings, Edit, ImagePlus, Loader2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import type { Class, Student } from '@schofy/shared';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { Gender } from '@schofy/shared';
import ImageModal from '../components/ImageModal';
import { useStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { getClassDisplayName, validateStudentClassAssignments, fixInvalidClassAssignments, resolveClassIdFromText, sortClassesBySectionThenLevel } from '../utils/classroom';
import { addToRecycleBin } from '../utils/recycleBin';
import { generateUUID } from '../utils/uuid';
import { useTableData } from '../lib/store';
import { useCurrency } from '../hooks/useCurrency';
import { useThrottle } from '../hooks/useDebounce';
import { useConfirm } from '../components/ConfirmModal';
import { PortalDropdown } from '../components/PortalDropdown';
import { BulkEditClassModal } from '../components/BulkEditClassModal';
import { FullscreenButton } from '../components/FullscreenButton';
import { countsTowardPlan, getSubscriptionAccessState } from '../utils/plans';
import { deleteInFortyPercentBatches } from '../utils/bulkDelete';
import { FitStatValue } from '../components/FitStatValue';
import { LargeDataSpinner } from '../components/LargeDataSpinner';
import { sortStudentsForList } from '../utils/studentOrdering';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { BulkImageUpdateModal, type BulkImageRecord } from '../components/BulkImageUpdateModal';
import { OperationProgressPopup } from '../components/OperationProgressPopup';
import { getImportCellText, parseImportFile } from '../utils/importParser';

const avatarColors = [
  'bg-rose-500',
  'bg-teal-500',
  'bg-violet-500',
  'bg-lime-500',
  'bg-pink-500',
  'bg-sky-500',
  'bg-amber-500',
];

const DEFAULT_STUDENTS_PAGE_SIZE = 10;
const LARGE_SHOW_ALL_THRESHOLD = 500;
const LARGE_SHOW_ALL_PAGE_FRACTION = 0.2;
const SHOW_ALL_TRANSITION_MS = 1500;
const SHOW_ALL_SWAP_DELAY_MS = 260;

function getAvatarColor(name: string) {
  const index = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[index];
}

const expectedFields = [
  { key: 'studentId', label: 'Student ID', required: false, aliases: ['id', 'student no', 'student number', 'id number', 'learner id'] },
  { key: 'admissionNo', label: 'Admission No', required: false, aliases: ['admission number', 'adm no', 'adm', 'admission id', 'adm id'] },
  { key: 'firstName', label: 'First Name', required: true, aliases: ['firstname', 'given name', 'forename', 'name', 'student name', 'learner name', 'full name'] },
  { key: 'lastName', label: 'Last Name', required: true, aliases: ['lastname', 'surname', 'family name'] },
  { key: 'gender', label: 'Gender (male/female)', required: true, aliases: ['sex'] },
  { key: 'dob', label: 'Date of Birth (YYYY-MM-DD)', required: false, aliases: ['date of birth', 'birth date', 'birthday'] },
  { key: 'classId', label: 'Class', required: true, aliases: ['class name', 'grade', 'level', 'form'] },
  { key: 'stream', label: 'Stream', required: false, aliases: ['section', 'section number', 'section no', 'arm', 'arm number', 'arm no', 'class stream', 'stream name', 'stream number', 'stream no', 'division', 'group', 'track'] },
  { key: 'address', label: 'Address', required: false, aliases: ['home address'] },
  { key: 'guardianName', label: 'Guardian Name', required: false, aliases: ['parent name', 'parent/guardian', 'guardian'] },
  { key: 'guardianPhone', label: 'Guardian Phone', required: false, aliases: ['parent phone', 'phone', 'contact'] },
  { key: 'guardianEmail', label: 'Guardian Email', required: false, aliases: ['parent email', 'parent email address', 'guardian email address'] },
  { key: 'studentEmail', label: 'Student Email', required: false, aliases: ['email', 'email address', 'learner email', 'student email address'] },
];

function generateStudentId(firstName: string, lastName: string): string {
  const fn = (firstName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  const ln = (lastName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  const digits = Math.floor(100 + Math.random() * 900);
  return `${fn}${ln}${digits}`;
}

function studentMatchesTextSearch(student: Student, term: string, classes: Class[]) {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
  const className = getClassDisplayName(student.classId, classes).toLowerCase();
  return [
    fullName,
    student.firstName,
    student.lastName,
    student.studentId,
    student.admissionNo,
    student.guardianName,
    student.guardianPhone,
    student.guardianEmail,
    student.gender,
    student.status,
    className,
  ].some(value => String(value || '').toLowerCase().includes(query));
}

function normalizeImportHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function StudentActions({
  student,
  onMarkCompleted,
  onEdit,
  onToggleStatus,
  onSendEmail,
  onDelete,
}: {
  student: Student;
  onMarkCompleted: (id: string) => void;
  onEdit: (id: string) => void;
  onToggleStatus: (student: Student) => void;
  onSendEmail: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
        className={`p-1.5 rounded-lg transition-all ${
          isOpen
            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-500/20'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
        }`}
        title="Student actions"
      >
        <Settings size={15} className={isOpen ? 'animate-spin-slow' : ''} />
      </button>

      <PortalDropdown triggerRef={btnRef} isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <PortalDropdown.Item icon={<Edit size={13} />} label="Edit" onClick={() => { onEdit(student.id); setIsOpen(false); }} />
        {student.status === 'active' && (
          <>
            <PortalDropdown.Divider />
            <PortalDropdown.Item icon={<GraduationCap size={13} />} label="Complete" onClick={() => { onMarkCompleted(student.id); setIsOpen(false); }} />
          </>
        )}
        <PortalDropdown.Divider />
        <PortalDropdown.Item
          icon={student.status === 'active' ? <UserMinus size={13} /> : <UserCheck size={13} />}
          label={student.status === 'active' ? 'Deactivate' : 'Activate'}
          onClick={() => { onToggleStatus(student); setIsOpen(false); }}
        />
        <PortalDropdown.Divider />
        <PortalDropdown.Item icon={<Mail size={13} />} label="Email" onClick={() => { onSendEmail(student.id); setIsOpen(false); }} />
        <PortalDropdown.Divider />
        <PortalDropdown.Item icon={<Trash2 size={13} />} label="Delete" danger onClick={() => { onDelete(student.id); setIsOpen(false); }} />
      </PortalDropdown>
    </>
  );
}

export default function Students() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const confirm = useConfirm();
  // All students from store — always up to date, used for stats cards
  const { data: allStudentsData, loading: studentsStoreLoading } = useTableData(sid, 'students');
  const allStudents = allStudentsData as Student[];
  const { data: classesStoreData } = useTableData(sid, 'classes');
  const { data: feesData } = useTableData(sid, 'fees');
  const { data: paymentsData } = useTableData(sid, 'payments');
  const { formatMoney } = useCurrency();

  const financeByStudent = useMemo(() => {
    const paidByFee = new Map<string, number>();
    (paymentsData as any[]).forEach((payment) => {
      if (!payment.feeId) return;
      paidByFee.set(payment.feeId, (paidByFee.get(payment.feeId) || 0) + Number(payment.amount || 0));
    });
    const next = new Map<string, { status: string; balance: number; invoiced: number; paid: number }>();
    (feesData as any[]).forEach((fee) => {
      if (!fee.studentId) return;
      const current = next.get(fee.studentId) || { status: 'none', balance: 0, invoiced: 0, paid: 0 };
      current.invoiced += Number(fee.amount || 0);
      current.paid += paidByFee.get(fee.id) || 0;
      current.balance = current.invoiced - current.paid;
      current.status = current.balance <= 0 ? 'paid' : current.paid > 0 ? 'partial' : 'pending';
      next.set(fee.studentId, current);
    });
    return next;
  }, [feesData, paymentsData]);

  // Compute invoice status and balance per student
  function getStudentFinance(studentId: string) {
    return financeByStudent.get(studentId) || { status: 'none', balance: 0, invoiced: 0 };
  }

  const { loadPage, searchStudents, refresh: refreshStudents } = useStudents();
  const [students, setStudents] = useState<Student[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [showAllTransitioning, setShowAllTransitioning] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const effectiveListSize = totalCount || allStudents.length;
  const isLargeShowAllList = showAll && effectiveListSize > LARGE_SHOW_ALL_THRESHOLD;
  const itemsPerPage = showAll
    ? isLargeShowAllList
      ? Math.max(DEFAULT_STUDENTS_PAGE_SIZE, Math.ceil(effectiveListSize * LARGE_SHOW_ALL_PAGE_FRACTION))
      : Math.max(effectiveListSize, DEFAULT_STUDENTS_PAGE_SIZE)
    : DEFAULT_STUDENTS_PAGE_SIZE;
  const { addToast } = useToast();
  // ... rest of state stays same
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportDropdownPos, setExportDropdownPos] = useState({ top: 0, right: 0 });
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [customFieldMapping, setCustomFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Student>[]>([]);
  const [isPreviewingImport, setIsPreviewingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [operationProgress, setOperationProgress] = useState<{ open: boolean; title: string; detail: string; progress: number; processed?: number; total?: number }>({
    open: false,
    title: '',
    detail: '',
    progress: 0,
  });
  const [flaggedItems, setFlaggedItems] = useState<Record<number, { action: 'skip' | 'duplicate' | 'replace'; existingId?: string; existingStudent?: Partial<Student> }>>({});
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showSelectionBar, setShowSelectionBar] = useState(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'active' | 'deactivated' | 'completed'>('active');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showClassFilter, setShowClassFilter] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkImageModal, setShowBulkImageModal] = useState(false);
  const [completedYearFilter, setCompletedYearFilter] = useState<string>('');
  const [planLimitMessage, setPlanLimitMessage] = useState<string | null>(null);
  const [importRemaining, setImportRemaining] = useState<number | null>(null);
  const [importPlanName, setImportPlanName] = useState<string>('your current plan');
  const navigate = useNavigate();
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const classFilterRef = useRef<HTMLDivElement>(null);
  const statusFilterButtonRef = useRef<HTMLButtonElement>(null);
  const classFilterButtonRef = useRef<HTMLButtonElement>(null);
  const [statusDropdownPos, setStatusDropdownPos] = useState({ top: 0, left: 0 });
  const [classDropdownPos, setClassDropdownPos] = useState({ top: 0, left: 0 });
  const listLoading = useMinimumLoading(loading || studentsStoreLoading, 1600);

  const getImportStatus = () => {
    switch (viewFilter) {
      case 'active': return 'active';
      case 'deactivated': return 'inactive';
      case 'completed': return 'completed';
      default: return 'active';
    }
  };

  const countsAsNewEnrolledImport = (
    index: number,
    flags: Record<number, { action: 'skip' | 'duplicate' | 'replace'; existingId?: string; existingStudent?: Partial<Student> }> = flaggedItems,
  ) => {
    const flagged = flags[index];
    if (flagged?.action === 'skip') return false;
    if (flagged?.action === 'replace') {
      return flagged.existingStudent?.status === 'completed' && getImportStatus() !== 'completed';
    }
    return getImportStatus() !== 'completed';
  };

  const countNewEnrolledImports = (
    rows: Partial<Student>[] = importPreview,
    flags: Record<number, { action: 'skip' | 'duplicate' | 'replace'; existingId?: string; existingStudent?: Partial<Student> }> = flaggedItems,
  ) => rows.filter((_row, index) => countsAsNewEnrolledImport(index, flags)).length;

  const allowedNewImportCount = importRemaining === null
    ? countNewEnrolledImports()
    : Math.min(countNewEnrolledImports(), Math.max(0, importRemaining));
  const newEnrolledImportCount = countNewEnrolledImports();
  const hasImportOverflow = importRemaining !== null && newEnrolledImportCount > importRemaining;

  useEffect(() => {
    if (importStep !== 'preview' || importRemaining === null) return;
    if (newEnrolledImportCount > importRemaining) {
      const available = Math.max(0, importRemaining);
      setPlanLimitMessage(`Only ${available} student${available === 1 ? '' : 's'} remaining. This file has ${newEnrolledImportCount} new enrolled student${newEnrolledImportCount === 1 ? '' : 's'}. Use Import Available to add the first ${available} allowed student${available === 1 ? '' : 's'}, or upgrade your plan.`);
    } else {
      setPlanLimitMessage(null);
    }
  }, [flaggedItems, importPreview, importRemaining, importStep, newEnrolledImportCount]);
  const isReloadingRef = useRef(false);
  const hasLoadedListRef = useRef(false);

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
    setClasses(sortClassesBySectionThenLevel(classesStoreData as Class[]));
  }, [classesStoreData]);

  const loadData = useCallback(async () => {
    const id = schoolId || user?.id;
    if (!id) return;
    setLoading(!hasLoadedListRef.current);
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
        const ordered = sortStudentsForList(filtered);
        setStudents(ordered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));
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
      hasLoadedListRef.current = true;
      setLoading(false);
    }
  }, [user?.id, schoolId, debouncedSearch, selectedClass, viewFilter, currentPage, itemsPerPage, loadPage, searchStudents, loadClasses]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleToggleShowAll() {
    if (showAllTransitioning) return;
    setShowAllTransitioning(true);
    setCurrentPage(1);
    window.setTimeout(() => {
      setShowAll(value => !value);
    }, SHOW_ALL_SWAP_DELAY_MS);
    window.setTimeout(() => setShowAllTransitioning(false), SHOW_ALL_TRANSITION_MS);
  }

  useEffect(() => {
    const handleStudentsUpdated = (event?: Event) => {
      const detail = (event as CustomEvent<{ table?: string; localOnly?: boolean }> | undefined)?.detail;
      const table = detail?.table;
      if (table && table !== 'students') return;
      if (!detail?.localOnly) refreshStudents();
      void loadData();
    };

    window.addEventListener('studentsUpdated', handleStudentsUpdated);
    return () => {
      window.removeEventListener('studentsUpdated', handleStudentsUpdated);
    };
  }, [loadData, refreshStudents]);

  const availableClassIds = sortClassesBySectionThenLevel(classes)
    .map((classItem) => classItem.id)
    .filter((id) => classes.some((c) => c.id === id) || students.some((s) => s.classId === id));

  // Keep paginated `students` in sync with the global `allStudents` store
  // so changes from other pages or realtime sync reflect immediately.
  useEffect(() => {
    if (debouncedSearch) return; // when searching we use search results instead
    const filtered = (allStudents || []).filter((student: Student) => {
      const matchesClass = !selectedClass || student.classId === selectedClass;
      const matchesView = viewFilter === 'all' || student.status === viewFilter || (viewFilter === 'deactivated' && student.status === 'inactive');
      return matchesClass && matchesView;
    });
    const ordered = sortStudentsForList(filtered);
    setStudents(ordered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage));
    setTotalCount(filtered.length);
  }, [allStudents, debouncedSearch, selectedClass, viewFilter, currentPage, itemsPerPage]);

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
      console.log('🔁 Classes updated, reloading...');
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
      console.log('🔁 Classes data changed, reloading students...');
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
      console.log('🔁 General data refresh, reloading classes...');
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
  const allFilteredStudents = useMemo(() => {
    const filtered = (allStudents || []).filter((student: Student) => {
      const matchesSearch = studentMatchesTextSearch(student, debouncedSearch, classes);
      const matchesClass = !selectedClass || student.classId === selectedClass;
      const matchesView = viewFilter === 'all' || student.status === viewFilter || (viewFilter === 'deactivated' && student.status === 'inactive');
      const matchesCompletedYear = viewFilter !== 'completed' || !completedYearFilter || (student as any).completedYear?.toString() === completedYearFilter;
      return matchesSearch && matchesClass && matchesView && matchesCompletedYear;
    });
    return sortStudentsForList(filtered);
  }, [allStudents, classes, debouncedSearch, selectedClass, viewFilter, completedYearFilter]);
  const filteredStudentIds = useMemo(() => allFilteredStudents.map(student => student.id), [allFilteredStudents]);
  const selectedFilteredCount = useMemo(
    () => filteredStudentIds.reduce((count, id) => count + (selectedStudents.has(id) ? 1 : 0), 0),
    [filteredStudentIds, selectedStudents]
  );
  const allFilteredStudentsSelected = filteredStudentIds.length > 0 && selectedFilteredCount === filteredStudentIds.length;
  const selectedStudentRecords = useMemo(
    () => (allStudents || []).filter((student: Student) => selectedStudents.has(student.id)),
    [allStudents, selectedStudents]
  );
  const selectedStudentImageRecords = useMemo<BulkImageRecord[]>(() => selectedStudentRecords
    .filter(student => selectedStudents.has(student.id))
    .map(student => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      primaryId: student.studentId || student.admissionNo,
      secondaryId: student.admissionNo,
      label: `${student.firstName} ${student.lastName}`,
    })), [selectedStudentRecords, selectedStudents]);

  async function ensureAvailableStudentCapacity(countToAdd: number) {
    const id = schoolId || user?.id;
    if (!id || countToAdd <= 0) return true;

    const access = await getSubscriptionAccessState(id, undefined, { authUserId: user?.id });
    const currentPlan = access.plan?.name || 'No active plan';
    if (!access.plan || access.status === 'incomplete' || access.status === 'expired') {
      const message = `Choose an active plan before restoring available students. Current plan: ${currentPlan}. Upgrade to continue.`;
      setPlanLimitMessage(message);
      addToast(message, 'error');
      navigate('/plans');
      return false;
    }

    if (access.plan.studentLimit > 0 && countToAdd > access.remaining) {
      const available = Math.max(0, access.remaining);
      const message = `Current plan: ${access.plan.name}. You have ${available} available student${available === 1 ? '' : 's'} remaining, but this action adds ${countToAdd}. Upgrade your plan to continue.`;
      setPlanLimitMessage(message);
      addToast(message, 'error');
      navigate('/plans');
      return false;
    }

    setPlanLimitMessage(null);
    return true;
  }

  useEffect(() => {
    const lastPage = Math.max(1, totalPages);
    setCurrentPage((page) => Math.min(Math.max(page, 1), lastPage));
  }, [totalPages]);

  async function cleanupOrphanedRecords() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      addToast('Cleaning up...', 'info');
      const allStudentsRaw = await dataService.getAll(id, 'students');

      // --- 1. Remove duplicate students (same firstName+lastName, keep oldest) ---
      const seen = new Map<string, any>();
      const duplicateIds: string[] = [];
      // Sort oldest first so we keep the first-created record
      const sorted = [...allStudentsRaw].sort((a, b) =>
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
      for (const s of sorted) {
        const key = `${(s.firstName || '').toLowerCase().trim()}::${(s.lastName || '').toLowerCase().trim()}`;
        if (seen.has(key)) {
          duplicateIds.push(s.id);
        } else {
          seen.set(key, s);
        }
      }
      if (duplicateIds.length > 0) {
        await dataService.batchDelete(id, 'students', duplicateIds);
      }

      // --- 2. Remove orphaned related records ---
      const validIds = new Set(allStudentsRaw.map((s: any) => s.id).filter((i: string) => !duplicateIds.includes(i)));
      let cleanedCount = 0;

      const tablesToCheck = ['fees', 'payments', 'invoices', 'bursaries', 'transportAssignments', 'examResults'];
      for (const table of tablesToCheck) {
        const records = await dataService.getAll(id, table);
        const orphanedIds = records
          .filter(r => r.studentId && !validIds.has(r.studentId))
          .map(r => r.id);
        if (orphanedIds.length > 0) {
          await dataService.batchDelete(id, table, orphanedIds);
          cleanedCount += orphanedIds.length;
        }
      }

      const attendanceRecords = await dataService.getAll(id, 'attendance');
      const orphanedAttendanceIds = attendanceRecords
        .filter(r => r.entityType === 'student' && r.entityId && !validIds.has(r.entityId))
        .map(r => r.id);
      if (orphanedAttendanceIds.length > 0) {
        await dataService.batchDelete(id, 'attendance', orphanedAttendanceIds);
        cleanedCount += orphanedAttendanceIds.length;
      }

      if (duplicateIds.length > 0 || cleanedCount > 0) {
        await refreshStudents();
        await loadData();
        window.dispatchEvent(new CustomEvent('studentsUpdated', { detail: { table: 'students', localOnly: true } }));
      }

      const parts: string[] = [];
      if (duplicateIds.length > 0) parts.push(`${duplicateIds.length} duplicate student${duplicateIds.length > 1 ? 's' : ''} removed`);
      if (cleanedCount > 0) parts.push(`${cleanedCount} orphaned record${cleanedCount > 1 ? 's' : ''} removed`);
      addToast(parts.length > 0 ? parts.join(', ') : 'Nothing to clean up', parts.length > 0 ? 'success' : 'info');
    } catch (error) {
      console.error('Cleanup error:', error);
      addToast('Failed to cleanup records', 'error');
    }
  }

  async function checkClassAssignments() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      setOperationProgress({
        open: true,
        title: 'Checking class assignments',
        detail: 'Checking students and classes.',
        progress: 5,
        processed: 0,
        total: 0,
      });
      const validation = await validateStudentClassAssignments(id);
      setOperationProgress({
        open: true,
        title: validation.invalidAssignments > 0 ? 'Fixing class assignments' : 'Checking class assignments',
        detail: validation.invalidAssignments > 0
          ? `Found ${validation.invalidAssignments} student${validation.invalidAssignments === 1 ? '' : 's'} to fix.`
          : 'All class assignments are valid.',
        progress: validation.invalidAssignments > 0 ? 10 : 100,
        processed: 0,
        total: validation.invalidAssignments,
      });
      if (validation.invalidAssignments > 0) {
        const result = await fixInvalidClassAssignments(id, (progress, processed, total, detail) => {
          setOperationProgress({
            open: true,
            title: 'Fixing class assignments',
            detail,
            progress,
            processed,
            total,
          });
        });
        setOperationProgress({
          open: true,
          title: 'Fixing class assignments',
          detail: result.message,
          progress: 100,
          processed: result.fixed,
          total: validation.invalidAssignments,
        });
        addToast(result.message, result.fixed > 0 ? 'success' : 'info');
        await loadData();
      } else {
        addToast('All class assignments are valid', 'success');
      }
    } catch (error) {
      console.error('Class assignment check error:', error);
      addToast(error instanceof Error ? error.message : 'Failed to check class assignments', 'error');
    } finally {
      window.setTimeout(() => {
        setOperationProgress(prev => (
          prev.title === 'Fixing class assignments' || prev.title === 'Checking class assignments'
            ? { ...prev, open: false }
            : prev
        ));
      }, 700);
    }
  }

  async function handleDelete(id: string) {
    const authId = schoolId || user?.id;
    if (!authId) return;
    const student = students.find(s => s.id === id);
    const name = student ? `${student.firstName} ${student.lastName}` : 'this student';
    const ok = await confirm({
      title: 'Delete Student',
      description: `This will permanently delete ${name} and move them to the recycle bin. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const result = await dataService.delete(authId, 'students', id);
      if (!result.success) throw new Error(result.error || 'Failed to delete');
      setStudents(prev => prev.filter(s => s.id !== id));
      setTotalCount(prev => prev - 1);
      if (student) {
        addToRecycleBin(authId, {
          id: `student-${Date.now()}`,
          type: 'student' as const,
          name: `${student.firstName} ${student.lastName}`,
          data: student,
          deletedAt: new Date().toISOString(),
        });
      }
      addToast('Student deleted', 'success');
    } catch (error) {
      addToast('Failed to delete student', 'error');
    }
  }

  async function handleToggleStatus(student: Student) {
    const id = schoolId || user?.id;
    if (!id) return;
    const newStatus = student.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'inactive' ? 'Deactivate' : 'Activate';
    const ok = await confirm({
      title: `${action} Student`,
      description: `${action} ${student.firstName} ${student.lastName}? ${newStatus === 'inactive' ? 'They will no longer appear in active lists.' : 'They will be restored to active status.'}`,
      confirmLabel: action,
      variant: 'warning',
    });
    if (!ok) return;
    try {
      await dataService.update(id, 'students', student.id, { status: newStatus } as any);
      addToast(`Student ${newStatus === 'active' ? 'activated' : 'deactivated'}`, 'success');
    } catch {
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
    const student = students.find(s => s.id === studentId);
    const name = student ? `${student.firstName} ${student.lastName}` : 'this student';
    const ok = await confirm({
      title: 'Mark as Completed',
      description: `Mark ${name} as completed (graduated)? They will be moved to School Records and no longer appear in active lists.`,
      confirmLabel: 'Mark Completed',
      variant: 'info',
    });
    if (!ok) return;
    try {
      await dataService.update(id, 'students', studentId, {
        status: 'completed' as const,
        updatedAt: new Date().toISOString(),
        completedYear: new Date().getFullYear(),
        completedTerm: 'Final',
      } as any);
      addToast('Student marked as completed', 'success');
    } catch {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleMarkActive(studentId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    const student = allStudents.find(s => s.id === studentId) || students.find(s => s.id === studentId);
    if (!student || !countsTowardPlan(student)) {
      if (!(await ensureAvailableStudentCapacity(1))) return;
    }
    try {
      await dataService.update(id, 'students', studentId, { status: 'active' } as any);
      addToast('Student reactivated', 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleSendEmail(studentId: string) {
    const student = students.find(s => s.id === studentId);
    if (!student?.guardianEmail) {
      addToast('No guardian email available', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Send Email',
      description: `Open email client to send a message to ${student.guardianName || 'guardian'} at ${student.guardianEmail}?`,
      confirmLabel: 'Open Email',
      variant: 'info',
    });
    if (ok) window.open(`mailto:${student.guardianEmail}`, '_blank');
  }

  function handleSelectAll() {
    if (filteredStudentIds.length === 0) {
      setSelectedStudents(new Set());
      return;
    }
    if (allFilteredStudentsSelected) {
      setSelectedStudents(new Set());
    } else {
      setSelectMode(true);
      setSelectedStudents(new Set(filteredStudentIds));
      setShowSelectionBar(true);
      addToast(`${filteredStudentIds.length} student${filteredStudentIds.length === 1 ? '' : 's'} selected`, 'success');
    }
  }

  async function handleBulkDelete() {
    const id = schoolId || user?.id;
    if (!id || selectedStudents.size === 0) return;
    const ok = await confirm({
      title: `Delete ${selectedStudents.size} Student${selectedStudents.size > 1 ? 's' : ''}`,
      description: `Permanently delete ${selectedStudents.size} student${selectedStudents.size > 1 ? 's' : ''} and move them to the recycle bin? This cannot be undone.`,
      confirmLabel: 'Delete All',
      variant: 'danger',
    });
    if (!ok) return;
    
    try {
      const now = new Date().toISOString();
      const idsToDelete = Array.from(selectedStudents);
      const recycleItems = idsToDelete
        .map(studentId => selectedStudentRecords.find(s => s.id === studentId) || allStudents.find(s => s.id === studentId))
        .filter(Boolean) as Student[];

      recycleItems.forEach(student => {
        addToRecycleBin(id, {
          id: `student-${Date.now()}-${Math.random()}`,
          type: 'student',
          name: `${student.firstName} ${student.lastName}`,
          data: student,
          deletedAt: now
        });
      });
      setOperationProgress({
        open: true,
        title: 'Deleting students',
        detail: 'Removing selected records in 40% batches.',
        progress: 5,
        processed: 0,
        total: idsToDelete.length,
      });
      const deletedCount = await deleteInFortyPercentBatches(id, 'students', idsToDelete, (_deletedIds, deletedTotal, total) => {
        setOperationProgress({
          open: true,
          title: 'Deleting students',
          detail: 'Removing selected records in 40% batches.',
          progress: Math.round((deletedTotal / total) * 100),
          processed: deletedTotal,
          total,
        });
      });

      if (deletedCount > 0) {
        window.dispatchEvent(new Event('studentsUpdated'));
      }
      
      setSelectedStudents(new Set());
      setSelectMode(false);
      addToast(`${deletedCount} students deleted`, 'success');
    } catch (error) {
      console.error('Bulk delete error:', error);
      addToast('Failed to delete students', 'error');
    } finally {
      window.setTimeout(() => {
        setOperationProgress(prev => prev.title === 'Deleting students' ? { ...prev, open: false } : prev);
      }, 350);
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
    const selectedRecords = Array.from(selectedStudents)
      .map(studentId => selectedStudentRecords.find(s => s.id === studentId) || allStudents.find(s => s.id === studentId))
      .filter(Boolean) as Student[];
    const missingRecords = selectedStudents.size - selectedRecords.length;
    const countToRestore = selectedRecords.filter(student => !countsTowardPlan(student)).length + missingRecords;
    if (!(await ensureAvailableStudentCapacity(countToRestore))) return;
    
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

  async function handleBulkEditClass(classId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedStudents.size === 0) return;
    
    try {
      const now = new Date().toISOString();
      
      for (const studentId of selectedStudents) {
        await dataService.update(id, 'students', studentId, { classId, updatedAt: now } as any);
      }
      
      setSelectedStudents(new Set());
      setSelectMode(false);
      addToast(`${selectedStudents.size} students moved to ${getClassDisplayName(classId, classes)}`, 'success');
    } catch (error) {
      addToast('Failed to update classes', 'error');
    }
  }

  function handleBulkSendEmail() {
    const selectedList = selectedStudentRecords.filter(s => selectedStudents.has(s.id) && s.guardianEmail);
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
    setShowExportMenu(false);
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
      const target = event.target as Node;
      const isExportMenuClick = target instanceof Element && target.closest('[data-students-export-menu="true"]');
      if (exportMenuRef.current && !exportMenuRef.current.contains(target) && !isExportMenuClick) {
        setShowExportMenu(false);
      }
      if (statusFilterRef.current && !statusFilterRef.current.contains(target)) {
        setShowStatusFilter(false);
      }
      if (classFilterRef.current && !classFilterRef.current.contains(target)) {
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
        case 'classId': return 'Primary 1';
        case 'stream': return 'A';
        case 'address': return '123 Main Street';
        case 'guardianName': return 'Jane Doe';
        case 'guardianPhone': return '0771234567';
        case 'guardianEmail': return 'jane@example.com';
        case 'studentEmail': return 'john@example.com';
        default: return '';
      }
    });
    
    import('xlsx').then(({ utils, writeFile }) => {
      const ws = utils.aoa_to_sheet([headers, sampleRow]);
      ws['!cols'] = headers.map(() => ({ wch: 22 }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Students');
      writeFile(wb, 'student-import-template.xlsx');
      addToast('Excel template downloaded', 'success');
    });
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvData([]);
    setFieldMapping({});
    setCustomFieldMapping({});
    setImportPreview([]);
    setIsPreviewingImport(false);
    setPlanLimitMessage(null);
    setImportRemaining(null);
    setIsImporting(false);
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const { headers, data } = await parseImportFile(file);
      
      setCsvHeaders(headers);
      setCsvData(data);
      
      const autoMapping: Record<string, string> = {};
      const normalizedHeaders = headers.map(header => ({ header, normalized: normalizeImportHeader(header) }));
      expectedFields.forEach(field => {
        const candidates = [
          field.key,
          field.label,
          ...((field as any).aliases || []),
        ].map(normalizeImportHeader).filter(Boolean);
        const matching = normalizedHeaders.find(({ normalized }) =>
          candidates.some(candidate => normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized))
        );
        if (matching) autoMapping[field.key] = matching.header;
      });
      const mappedHeaders = new Set(Object.values(autoMapping).filter(Boolean));
      const autoCustomMapping: Record<string, string> = {};
      headers.forEach(header => {
        if (!header || mappedHeaders.has(header)) return;
        autoCustomMapping[header] = header;
      });
      setFieldMapping(autoMapping);
      setCustomFieldMapping(autoCustomMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) {
      console.error('File read error:', error);
      addToast(error instanceof Error ? error.message : 'Failed to read import file', 'error');
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

  function normalizeImportToken(value: unknown): string {
    const wordNumbers: Record<string, string> = {
      baby: 'baby',
      middle: 'middle',
      top: 'top',
      nursery: 'nursery',
      kg: 'kg',
      kindergarten: 'kg',
      reception: 'reception',
      zero: '0',
      one: '1',
      first: '1',
      two: '2',
      second: '2',
      three: '3',
      third: '3',
      four: '4',
      fourth: '4',
      five: '5',
      fifth: '5',
      six: '6',
      sixth: '6',
      seven: '7',
      seventh: '7',
      eight: '8',
      eighth: '8',
      nine: '9',
      ninth: '9',
      ten: '10',
      tenth: '10',
      eleven: '11',
      eleventh: '11',
      twelve: '12',
      twelfth: '12',
      thirteen: '13',
      thirteenth: '13',
    };
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\b(class|grade|level|standard|std|year)\b/g, '')
      .replace(/\b(primary|pri|pry)\b/g, 'p')
      .replace(/\b(senior secondary|secondary|senior)\b/g, 's')
      .replace(/\bjunior secondary\b/g, 'jss')
      .replace(/\b(baby class)\b/g, 'baby')
      .replace(/\b([a-z]+)\b/g, part => wordNumbers[part] || part)
      .replace(/[^a-z0-9]+/g, '');
  }

  function normalizeImportId(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function getImportClassesForMatching(): Class[] {
    const availableImportClasses = classes.length > 0 ? classes : (classesStoreData as Class[]);
    return availableImportClasses.length > 0
      ? availableImportClasses
      : [
        { id: 'primary-1', name: 'Primary 1', level: 1, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'primary-2', name: 'Primary 2', level: 2, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'primary-3', name: 'Primary 3', level: 3, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'primary-4', name: 'Primary 4', level: 4, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'primary-5', name: 'Primary 5', level: 5, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'primary-6', name: 'Primary 6', level: 6, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'jss-1', name: 'JSS 1', level: 7, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'jss-2', name: 'JSS 2', level: 8, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'jss-3', name: 'JSS 3', level: 9, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'ss-1', name: 'SS 1', level: 10, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'ss-2', name: 'SS 2', level: 11, capacity: 40, schoolId: sid, createdAt: '' },
        { id: 'ss-3', name: 'SS 3', level: 12, capacity: 40, schoolId: sid, createdAt: '' },
      ] as Class[];
  }

  function resolveImportClassId(rawValue: unknown, streamValue?: unknown): string {
    return resolveClassIdFromText(rawValue, getImportClassesForMatching(), streamValue);
  }

  function inferImportStream(rawClassValue: unknown, explicitStreamValue: unknown, matchedClass?: Class): string {
    const explicitStream = getImportCellText(explicitStreamValue);
    if (explicitStream) return explicitStream;

    const rawClass = getImportCellText(rawClassValue);
    if (!rawClass) return '';

    const matchedStream = getImportCellText((matchedClass as any)?.stream);
    if (matchedStream && normalizeImportToken(rawClass).includes(normalizeImportToken(matchedStream))) {
      return matchedStream;
    }

    const suffixPatterns = [
      /^(?:class|grade|level|standard|std|form|year)?\s*(?:p(?:rimary)?|pri|pry|jss|ss|s)?\s*\.?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s*(?:-|\/|\\|\s+|stream\s+|section\s+|arm\s+)+([a-z0-9][a-z0-9 ._-]*)$/i,
      /^(?:p|primary|pri|pry|jss|ss|s)\s*\.?\s*\d+\s*([a-z])$/i,
    ];

    for (const pattern of suffixPatterns) {
      const match = rawClass.match(pattern);
      const stream = getImportCellText(match?.[1]).replace(/^(stream|section|arm)\s+/i, '').trim();
      if (stream) return stream.toUpperCase();
    }

    return '';
  }

  function getKnownMappedHeaders(mapping: Record<string, string> = fieldMapping) {
    return new Set(Object.values(mapping).filter(Boolean));
  }

  function updateKnownFieldMapping(fieldKey: string, header: string) {
    setFieldMapping(prev => {
      const next = { ...prev, [fieldKey]: header };
      const used = getKnownMappedHeaders(next);
      setCustomFieldMapping(customPrev => {
        const customNext = { ...customPrev };
        csvHeaders.forEach(csvHeader => {
          if (used.has(csvHeader)) delete customNext[csvHeader];
          else if (customNext[csvHeader] === undefined) customNext[csvHeader] = csvHeader;
        });
        return customNext;
      });
      return next;
    });
  }

  function processMapping() {
    const mappedData: Partial<Student>[] = [];
    const newFlaggedItems: Record<number, { action: 'skip' | 'duplicate' | 'replace'; existingId?: string; existingStudent?: Partial<Student> }> = {};
    const headerIndexByName = new Map(csvHeaders.map((header, index) => [header, index]));
    const fieldIndexes = expectedFields.map(field => ({
      key: field.key,
      index: fieldMapping[field.key] ? headerIndexByName.get(fieldMapping[field.key]) ?? -1 : -1,
    }));
    const customFieldIndexes = Object.entries(customFieldMapping)
      .map(([header, label]) => ({
        header,
        label: label.trim(),
        index: headerIndexByName.get(header) ?? -1,
      }))
      .filter(item => item.label && item.index !== -1);
    const existingByName = new Map(
      allStudents.map(student => [
        `${student.firstName || ''}|${student.lastName || ''}`.toLowerCase(),
        student,
      ])
    );
    const existingByImportId = new Map<string, Student>();
    allStudents.forEach(student => {
      [student.id, student.studentId, student.admissionNo].forEach(value => {
        const key = normalizeImportId(value);
        if (key && !existingByImportId.has(key)) existingByImportId.set(key, student);
      });
    });
    
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const student: Partial<Student> = {};
      
      fieldIndexes.forEach(field => {
        if (field.index !== -1) {
          const value = getImportCellText(row[field.index]);
          if (value) {
            (student as any)[field.key] = value;
          }
        }
      });
      if ((student as any).firstName && !(student as any).lastName) {
        const mappedFirstHeader = fieldMapping.firstName || '';
        const looksLikeFullName = ['name', 'studentname', 'learnername', 'fullname'].includes(normalizeImportHeader(mappedFirstHeader));
        if (looksLikeFullName) {
          const parts = getImportCellText((student as any).firstName).split(/\s+/).filter(Boolean);
          if (parts.length > 1) {
            (student as any).firstName = parts.shift() || '';
            (student as any).lastName = parts.join(' ');
          }
        }
      }
      const customFields = customFieldIndexes
        .map(field => ({
          id: generateUUID(),
          label: field.label,
          value: getImportCellText(row[field.index]),
        }))
        .filter(field => field.value);
      if (customFields.length > 0) {
        (student as any).customFields = customFields;
      }
      const importedId = (student as any).studentId || (student as any).admissionNo || (student as any).id;
      const resolvedClassId = resolveImportClassId((student as any).classId, (student as any).stream);
      const matchedClass = getImportClassesForMatching().find(classItem => classItem.id === resolvedClassId);
      const inferredStream = inferImportStream((student as any).classId, (student as any).stream, matchedClass);
      if (inferredStream) {
        (student as any).stream = inferredStream;
      }
      if ((student as any).classId && resolvedClassId) {
        (student as any).classId = resolvedClassId;
      } else if ((student as any).classId) {
        (student as any).classId = '';
      }
      
      if (student.firstName || student.lastName) {
        const fn = (student.firstName as string) || '';
        const ln = (student.lastName as string) || '';
        const generatedId = generateStudentId(fn, ln);
        
        (student as any).id = generatedId;
        
        const existingStudent = existingByImportId.get(normalizeImportId(importedId)) || existingByName.get(`${fn}|${ln}`.toLowerCase());
        
        if (existingStudent) {
          newFlaggedItems[i] = {
            action: 'replace',
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
    const id = schoolId || user?.id;
    if (id) {
      void getSubscriptionAccessState(id, undefined, { authUserId: user?.id }).then(access => {
        setImportPlanName(access.plan?.name || 'No active plan');
        setImportRemaining(access.remaining);
        const importable = countNewEnrolledImports(mappedData, newFlaggedItems);
        if (!access.plan || access.status === 'incomplete' || access.status === 'expired') {
          setPlanLimitMessage(`Choose an active plan before importing students. Current plan: ${access.plan?.name || 'No active plan'}. Upgrade to continue.`);
        } else if (importable > access.remaining) {
          const available = Math.max(0, access.remaining);
          setPlanLimitMessage(`Current plan: ${access.plan.name}. Only ${available} student${available === 1 ? '' : 's'} remaining, but this file has ${importable} new enrolled student${importable === 1 ? '' : 's'}. Use Import Available to add the allowed students, or upgrade your plan.`);
        }
      }).catch(() => {
        setImportRemaining(null);
        setImportPlanName('your current plan');
      });
    }
    setImportStep('preview');
  }

  async function previewImportWithDelay() {
    if (isPreviewingImport) return;
    setIsPreviewingImport(true);
    try {
      await new Promise(resolve => window.setTimeout(resolve, 2000));
      processMapping();
    } finally {
      setIsPreviewingImport(false);
    }
  }

  async function handleBulkStudentImages(updates: Array<{ id: string; photoUrl: string }>) {
    const id = schoolId || user?.id;
    if (!id || updates.length === 0) return;
    const now = new Date().toISOString();
    await Promise.all(updates.map(update =>
      dataService.update(id, 'students', update.id, { photoUrl: update.photoUrl, updatedAt: now } as any)
    ));
    await refreshStudents();
    await loadData();
    addToast(`Updated ${updates.length} student image${updates.length === 1 ? '' : 's'}`, 'success');
    window.dispatchEvent(new CustomEvent('studentsUpdated', { detail: { table: 'students' } }));
  }

  async function handleRemoveBulkStudentImages(ids: string[]) {
    const id = schoolId || user?.id;
    if (!id || ids.length === 0) return;
    const now = new Date().toISOString();
    await Promise.all(ids.map(studentId =>
      dataService.update(id, 'students', studentId, { photoUrl: null, updatedAt: now } as any)
    ));
    await refreshStudents();
    await loadData();
    addToast(`Removed ${ids.length} student image${ids.length === 1 ? '' : 's'}`, 'success');
    window.dispatchEvent(new CustomEvent('studentsUpdated', { detail: { table: 'students' } }));
  }

  async function executeImport(importAvailableOnly = false) {
    const id = schoolId || user?.id;
    if (importPreview.length === 0 || !id) {
      addToast('No valid students to import', 'error');
      return;
    }

    if (isImporting) return;
    setIsImporting(true);
    setImportProgress(0);
    setOperationProgress({
      open: true,
      title: 'Importing students',
      detail: 'Preparing records in 40% phase.',
      progress: 5,
      processed: 0,
      total: importPreview.length,
    });

    try {
      const now = new Date().toISOString();
      let skippedCount = 0;
      let successCount = 0;
      let replacedCount = 0;

      const importStatus = getImportStatus();
      const newEnrolledCount = countNewEnrolledImports();

      let remaining = importRemaining;
      let activePlanName = importPlanName || 'your current plan';
      if (remaining === null) {
        const access = await getSubscriptionAccessState(id, undefined, { authUserId: user?.id });
        if (!access.plan || access.status === 'incomplete' || access.status === 'expired') {
          const message = `Choose an active plan before importing students. Current plan: ${access.plan?.name || 'No active plan'}. Upgrade to continue.`;
          addToast(message, 'error');
          setPlanLimitMessage(message);
          navigate('/plans');
          setIsImporting(false);
          return;
        }
        remaining = access.remaining;
        activePlanName = access.plan.name;
        setImportPlanName(activePlanName);
      }
      if (newEnrolledCount > remaining) {
        const available = Math.max(0, remaining);
        if (!importAvailableOnly || available <= 0) {
          const message = `Current plan: ${activePlanName}. Plan limit exceeded: you can add ${available} more enrolled student${available === 1 ? '' : 's'}, but this import adds ${newEnrolledCount}. Upgrade your plan to continue.`;
          setPlanLimitMessage(message);
          addToast(message, 'error');
          navigate('/plans');
          setIsImporting(false);
          return;
        }
        setPlanLimitMessage(`Current plan: ${activePlanName}. Importing ${available} available student${available === 1 ? '' : 's'} now. ${newEnrolledCount - available} extra student${newEnrolledCount - available === 1 ? '' : 's'} will be skipped until you upgrade.`);
      }

      setImportProgress(20);
      setOperationProgress({
        open: true,
        title: 'Importing students',
        detail: 'Matching classes and IDs.',
        progress: 20,
        processed: 0,
        total: importPreview.length,
      });
      const creates: Student[] = [];
      const updates: Array<{ id: string; data: Partial<Student> }> = [];
      let newEnrolledReserved = 0;
      const availableSlots = Math.max(0, remaining);
      const reservedIds = new Set(allStudents.map(s => s.id));

      const toStudentPayload = (data: Partial<Student>, displayId: string): Student => {
        const genderValue = ((data as any).gender as string)?.toLowerCase();
        const validGender = genderValue === 'female' ? Gender.FEMALE : genderValue === 'other' ? Gender.OTHER : Gender.MALE;

        return {
          id: generateUUID(),
          schoolId: id,
          studentId: (data as any).studentId || displayId,
          admissionNo: (data as any).admissionNo || displayId,
          firstName: (data.firstName as string) || 'Unknown',
          lastName: (data.lastName as string) || 'Unknown',
          dob: (data.dob as string) || '2000-01-01',
          gender: validGender,
          classId: (data.classId as string) || '',
          ...(((data as any).stream as string) ? { stream: (data as any).stream as string } : {}),
          address: (data.address as string) || '',
          guardianName: (data.guardianName as string) || '',
          guardianPhone: (data.guardianPhone as string) || '',
          guardianEmail: data.guardianEmail as string | undefined,
          ...(((data as any).studentEmail as string) ? { studentEmail: (data as any).studentEmail as string, email: (data as any).studentEmail as string } : {}),
          customFields: ((data as any).customFields || []) as any,
          status: importStatus as any,
          completedYear: importStatus === 'completed' ? new Date().getFullYear() : undefined,
          completedTerm: importStatus === 'completed' ? 'Final' : undefined,
          createdAt: now,
          updatedAt: now,
        };
      };

      const toUpdatePayload = (data: Partial<Student>): Partial<Student> => {
        const genderValue = ((data as any).gender as string)?.toLowerCase();
        const validGender = genderValue === 'female' ? Gender.FEMALE : genderValue === 'other' ? Gender.OTHER : Gender.MALE;
        const payload: Partial<Student> = {
          updatedAt: now,
        } as Partial<Student>;

        const assignIfValue = (key: string, value: unknown) => {
          if (value === undefined || value === null) return;
          const text = typeof value === 'string' ? value.trim() : value;
          if (typeof text === 'string' && text === '') return;
          (payload as any)[key] = text;
        };

        assignIfValue('studentId', (data as any).studentId);
        assignIfValue('admissionNo', (data as any).admissionNo);
        assignIfValue('firstName', data.firstName);
        assignIfValue('lastName', data.lastName);
        assignIfValue('dob', data.dob);
        if ((data as any).gender) assignIfValue('gender', validGender);
        assignIfValue('classId', data.classId);
        assignIfValue('stream', (data as any).stream);
        assignIfValue('address', data.address);
        assignIfValue('guardianName', data.guardianName);
        assignIfValue('guardianPhone', data.guardianPhone);
        assignIfValue('guardianEmail', data.guardianEmail);
        assignIfValue('studentEmail', (data as any).studentEmail);
        assignIfValue('email', (data as any).studentEmail);
        if (Array.isArray((data as any).customFields) && (data as any).customFields.length > 0) {
          (payload as any).customFields = (data as any).customFields;
        }
        assignIfValue('status', importStatus);
        if (importStatus === 'completed') {
          payload.completedYear = new Date().getFullYear();
          payload.completedTerm = 'Final';
        }
        return payload;
      };

      const mergeCustomFields = (existingStudent: Partial<Student> | undefined, incomingFields: any[] = []) => {
        const byLabel = new Map<string, any>();
        ((existingStudent as any)?.customFields || []).forEach((field: any) => {
          const key = String(field?.label || '').trim().toLowerCase();
          if (key) byLabel.set(key, field);
        });
        incomingFields.forEach((field: any) => {
          const label = String(field?.label || '').trim();
          if (!label) return;
          byLabel.set(label.toLowerCase(), {
            id: byLabel.get(label.toLowerCase())?.id || field.id || generateUUID(),
            label,
            value: String(field?.value ?? '').trim(),
          });
        });
        return Array.from(byLabel.values());
      };

      for (let i = 0; i < importPreview.length; i++) {
        const data = importPreview[i];
        const studentId = (data as any).id;
        const flagged = flaggedItems[i];
        const countsAsNewEnrolled = countsAsNewEnrolledImport(i);

        if (importAvailableOnly && countsAsNewEnrolled && newEnrolledReserved >= availableSlots) {
          skippedCount++;
          continue;
        }
        if (countsAsNewEnrolled) newEnrolledReserved++;

        if (flagged) {
          if (flagged.action === 'skip') {
            skippedCount++;
            continue;
          } else if (flagged.action === 'duplicate') {
            let newId = studentId;
            let counter = 1;
            while (reservedIds.has(newId)) {
              const fn = ((data as any).firstName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
              const ln = ((data as any).lastName || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
              newId = `${fn}${ln}${100 + counter}`;
              counter++;
            }
            reservedIds.add(newId);
            creates.push(toStudentPayload(data, newId));
          } else if (flagged.action === 'replace' && flagged.existingId) {
            const updatePayload = toUpdatePayload(data);
            if (Array.isArray((data as any).customFields) && (data as any).customFields.length > 0) {
              (updatePayload as any).customFields = mergeCustomFields(flagged.existingStudent, (data as any).customFields);
            }
            updates.push({ id: flagged.existingId, data: updatePayload });
          }
        } else {
          let studentIdLocal = (data as any).studentId || (data as any).admissionNo || (data as any).id || generateStudentId((data.firstName as string) || '', (data.lastName as string) || '');
          while (reservedIds.has(studentIdLocal)) studentIdLocal = generateUUID();
          reservedIds.add(studentIdLocal);
          creates.push(toStudentPayload(data, studentIdLocal));
        }
      }

      setImportProgress(70);
      setOperationProgress({
        open: true,
        title: 'Importing students',
        detail: 'Saving records locally.',
        progress: 70,
        processed: creates.length + updates.length,
        total: importPreview.length,
      });
      const result = await dataService.bulkImportStudents(id, creates, updates);
      successCount = result.imported;
      replacedCount = result.replaced;
      const planSkippedCount = Math.max(0, creates.length - result.imported);
      skippedCount += planSkippedCount;
      setImportProgress(100);
      setOperationProgress({
        open: true,
        title: 'Importing students',
        detail: 'Import complete.',
        progress: 100,
        processed: successCount + replacedCount,
        total: importPreview.length,
      });

      const parts: string[] = [];
      if (successCount > 0) parts.push(`${successCount} imported`);
      if (replacedCount > 0) parts.push(`${replacedCount} replaced`);
      if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
      
      if (planSkippedCount > 0 && result.error) setPlanLimitMessage(result.error);
      addToast(parts.join(', ') || 'Import complete', planSkippedCount > 0 ? 'warning' : 'success');
      if (planSkippedCount === 0) closeImportModal();
      window.dispatchEvent(new CustomEvent('studentsUpdated', { detail: { table: 'students', localOnly: true } }));
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'students', localOnly: true } }));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'students', localOnly: true } }));
      void loadData();
    } catch (error) {
      console.error('Import error:', error);
      addToast('Failed to import students', 'error');
    } finally {
      setIsImporting(false);
      window.setTimeout(() => {
        setOperationProgress(prev => prev.title === 'Importing students' ? { ...prev, open: false } : prev);
      }, 450);
    }
  }

  // Stats use ALL students (not just current page) — always accurate
  const activeCount = allStudents.filter(s => s.status === 'active').length;
  const deactivatedCount = allStudents.filter(s => s.status === 'inactive').length;
  const completedCount = allStudents.filter(s => s.status === 'completed').length;
  const totalEnrolled = allStudents.filter(s => s.status !== 'completed').length;

  const updateExportDropdownPosition = useCallback(() => {
    const rect = exportButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 192;
    setExportDropdownPos({
      top: rect.bottom + 8,
      right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - width - 8)),
    });
  }, []);

  function toggleExportMenu() {
    if (showExportMenu) {
      setShowExportMenu(false);
      return;
    }
    updateExportDropdownPosition();
    setShowExportMenu(true);
  }

  const getDropdownPosition = (button: HTMLButtonElement | null) => {
    const rect = button?.getBoundingClientRect();
    if (!rect) return { top: 0, left: 0 };
    const width = 224;
    return {
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
    };
  };

  const updateDropdownPositions = useCallback(() => {
    if (showStatusFilter) setStatusDropdownPos(getDropdownPosition(statusFilterButtonRef.current));
    if (showClassFilter) setClassDropdownPos(getDropdownPosition(classFilterButtonRef.current));
  }, [showStatusFilter, showClassFilter]);
  const throttledDropdownPositionUpdate = useThrottle(updateDropdownPositions, 50, [updateDropdownPositions]);

  useEffect(() => {
    updateDropdownPositions();
    if (!showStatusFilter && !showClassFilter) return;
    window.addEventListener('scroll', throttledDropdownPositionUpdate, true);
    window.addEventListener('resize', throttledDropdownPositionUpdate);
    return () => {
      window.removeEventListener('scroll', throttledDropdownPositionUpdate, true);
      window.removeEventListener('resize', throttledDropdownPositionUpdate);
    };
  }, [showStatusFilter, showClassFilter, updateDropdownPositions, throttledDropdownPositionUpdate]);

  useEffect(() => {
    if (!showExportMenu) return;
    updateExportDropdownPosition();
    window.addEventListener('scroll', updateExportDropdownPosition, true);
    window.addEventListener('resize', updateExportDropdownPosition);
    return () => {
      window.removeEventListener('scroll', updateExportDropdownPosition, true);
      window.removeEventListener('resize', updateExportDropdownPosition);
    };
  }, [showExportMenu, updateExportDropdownPosition]);

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
          <div className="relative z-[100]" ref={exportMenuRef}>
            <button 
              ref={exportButtonRef}
              onClick={toggleExportMenu}
              className="btn btn-secondary"
              title="Export"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export {viewFilter === 'all' ? '' : `(${viewFilter === 'completed' ? 'Records' : viewFilter})`}</span>
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" title="Import">
            <Upload size={16} />
            <span className="hidden sm:inline">Import {viewFilter === 'all' ? '' : `(${viewFilter === 'completed' ? 'Records' : viewFilter})`}</span>
          </button>
          <button onClick={checkClassAssignments} className="btn btn-secondary text-blue-600 hover:text-blue-700 dark:text-blue-400" title="Check class assignments">
            <Users size={16} />
            <span className="hidden lg:inline">Check Classes</span>
          </button>
          <button
            onClick={async () => {
              const ok = await confirm({
                title: 'Clean Up Student Records',
                description: 'This will remove duplicate students (keeping the oldest record) and delete any orphaned fees, payments, and attendance records that belong to deleted students.',
                confirmLabel: 'Run Cleanup',
                variant: 'warning',
              });
              if (ok) cleanupOrphanedRecords();
            }}
            className="btn btn-secondary text-amber-600 hover:text-amber-700 dark:text-amber-400"
            title="Clean up duplicates and orphaned records"
          >
            <Filter size={16} />
            <span className="hidden lg:inline">Cleanup</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".csv,.xlsx,.xls"
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
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/80">Total Students</p>
              <FitStatValue>{totalEnrolled}</FitStatValue>
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
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/80">Active Students</p>
              <FitStatValue>{activeCount}</FitStatValue>
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
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/80">Deactivated</p>
              <FitStatValue>{deactivatedCount}</FitStatValue>
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
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/80">School Records</p>
              <FitStatValue>{completedCount}</FitStatValue>
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
                  ref={statusFilterButtonRef}
                  onClick={() => {
                    setStatusDropdownPos(getDropdownPosition(statusFilterButtonRef.current));
                    setShowStatusFilter(!showStatusFilter);
                    setShowClassFilter(false);
                  }}
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
                {showStatusFilter && createPortal(
                  <div 
                    className={`fixed w-56 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[99999]
                      ${showStatusFilter ? 'animate-dropdown-in' : 'animate-dropdown-out'}`}
                    style={{ 
                      ...statusDropdownPos,
                      animationDuration: '400ms',
                      animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                      animationFillMode: 'forwards'
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
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
                  </div>,
                  document.body
                )}
              </div>

              {/* Class Filter Dropdown */}
              <div className="relative" ref={classFilterRef}>
                <button
                  ref={classFilterButtonRef}
                  onClick={() => {
                    setClassDropdownPos(getDropdownPosition(classFilterButtonRef.current));
                    setShowClassFilter(!showClassFilter);
                    setShowStatusFilter(false);
                  }}
                  className={`btn btn-secondary flex items-center gap-2 ${selectedClass ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
                >
                  <span className="hidden sm:inline">
                    {selectedClass ? getClassDisplayName(selectedClass, classes) : 'All Classes'}
                  </span>
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showClassFilter ? 'rotate-180' : ''}`} />
                </button>
                {showClassFilter && createPortal(
                  <div 
                    className="fixed w-56 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[99999] animate-dropdown-in"
                    style={{ 
                      ...classDropdownPos,
                      animationDuration: '400ms',
                      animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                      animationFillMode: 'forwards'
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
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
                  </div>,
                  document.body
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          {showSelectionBar && selectedStudents.size > 0 && viewFilter !== 'completed' && (
            <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between overflow-hidden transition-all duration-300 ease-out" style={{ maxHeight: selectMode ? '200px' : '0', opacity: selectMode ? 1 : 0 }}>
              <span className="text-sm text-indigo-700 dark:text-indigo-300 font-medium animate-selection-content-in">
                {selectedStudents.size} selected{selectedStudents.size > paginatedStudents.length ? ` across ${filteredStudentIds.length.toLocaleString()} shown by filters` : ''}
              </span>
              <div className="flex items-center gap-2 flex-wrap animate-selection-content-in">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {allFilteredStudentsSelected ? 'Deselect All' : `Select All (${filteredStudentIds.length.toLocaleString()})`}
                </button>
                {selectedStudents.size > 0 && (
                  <button
                    onClick={() => setShowBulkImageModal(true)}
                    className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                  >
                    <ImagePlus size={12} />
                    Edit Images
                  </button>
                )}
                {viewFilter !== 'deactivated' && (
                  <>
                    <button
                      onClick={() => setShowBulkEditModal(true)}
                      className="px-3 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                    >
                      <Users size={12} />
                      Edit Class
                    </button>
                    <button
                      onClick={handleBulkMarkCompleted}
                      className="px-3 py-1.5 text-xs bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                    >
                    <Award size={12} />
                    Mark Completed
                    </button>
                  </>
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
                {selectedStudents.size} selected (School Records){selectedStudents.size > paginatedStudents.length ? ` across ${filteredStudentIds.length.toLocaleString()} shown by filters` : ''}
              </span>
              <div className="flex items-center gap-2 flex-wrap animate-selection-content-in">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  {allFilteredStudentsSelected ? 'Deselect All' : `Select All (${filteredStudentIds.length.toLocaleString()})`}
                </button>
                {selectedStudents.size > 0 && (
                  <button
                    onClick={() => setShowBulkImageModal(true)}
                    className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-all duration-200 flex items-center gap-1 hover:scale-105 active:scale-95"
                  >
                    <ImagePlus size={12} />
                    Edit Images
                  </button>
                )}
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
          
          <div className={`students-show-all-stage ${showAllTransitioning ? 'students-show-all-stage-transitioning' : ''}`}>
            {showAllTransitioning && (
              <div className="students-show-all-progress" aria-hidden="true">
                <span />
              </div>
            )}
          {viewFilter !== 'completed' ? (
            <table>
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  {selectMode && <th className="w-10">
                    <button onClick={handleSelectAll} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                      {allFilteredStudentsSelected ? (
                        <CheckSquare size={16} className="text-primary-600" />
                      ) : (
                        <Square size={16} className="text-slate-400" />
                      )}
                    </button>
                  </th>}
                  <th>Student</th>
                  <th>ID Number</th>
                  <th>Class</th>
                  <th>Gender</th>
                  <th>Guardian</th>
                  <th>Invoice Status</th>
                  <th>Fees Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr>
                    <td colSpan={selectMode ? 9 : 8} className="text-center py-12">
                      <LargeDataSpinner
                        label={studentsStoreLoading ? 'Loading student records...' : 'Preparing student list...'}
                        detail="Large schools may take a moment while records are indexed."
                        compact
                      />
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
                      className={`group animate-slide-down cursor-pointer transition-colors ${selectedStudents.has(student.id) ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                      style={{ animationDelay: `${Math.min(index, 18) * 18}ms` }}
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
                      <td className="font-mono text-xs text-slate-700 dark:text-slate-300">
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
                        {(() => {
                          const { status } = getStudentFinance(student.id);
                          return (
                            <span className={`badge text-xs ${
                              status === 'paid'    ? 'badge-success' :
                              status === 'partial' ? 'badge-warning' :
                              status === 'pending' ? 'badge-danger'  :
                              'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}>
                              {status === 'none' ? 'No invoice' : status}
                            </span>
                          );
                        })()}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const { status, balance } = getStudentFinance(student.id);
                          if (status === 'none') return <span className="text-xs text-slate-400">—</span>;
                          if (balance <= 0) return <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Cleared</span>;
                          return <span className="text-xs font-semibold text-red-600 dark:text-red-400">{formatMoney(balance)}</span>;
                        })()}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <StudentActions
                          student={student}
                          onMarkCompleted={handleMarkCompleted}
                          onEdit={(studentId) => navigate(`/students/${studentId}/edit`)}
                          onToggleStatus={handleToggleStatus}
                          onSendEmail={handleSendEmail}
                          onDelete={handleDelete}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <div className="p-4">
              {listLoading ? (
                <LargeDataSpinner label="Loading school records..." detail="Preparing archived students for browsing." />
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
                    <div key={groupIndex} className="animate-slide-down border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden" style={{ animationDelay: `${Math.min(groupIndex, 10) * 35}ms` }}>
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
                        {group.students.map((student, studentIndex) => (
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
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                              {studentIndex + 1}
                            </span>
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
        </div>

        {viewFilter !== 'completed' && (
          <div className={`px-4 py-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 students-show-all-footer ${showAllTransitioning ? 'students-show-all-footer-transitioning' : ''}`}>
            <p className="text-sm text-slate-500">
              {showAll && !isLargeShowAllList ? (
                <><span className="font-medium text-slate-700 dark:text-slate-300">{totalCount}</span> students shown</>
              ) : (
                <><span className="font-medium text-slate-700 dark:text-slate-300">{Math.min((currentPage - 1) * itemsPerPage + 1, totalCount)}</span>{' - '}<span className="font-medium text-slate-700 dark:text-slate-300">{Math.min(currentPage * itemsPerPage, totalCount)}</span>{' of '}<span className="font-medium text-slate-700 dark:text-slate-300">{totalCount}</span></>
              )}
              {isLargeShowAllList && (
                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">20% per page</span>
              )}
            </p>
            <button
              onClick={handleToggleShowAll}
              disabled={showAllTransitioning}
              className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-70"
            >
              {showAllTransitioning && <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />}
              {showAllTransitioning ? (showAll ? 'Returning to pages...' : 'Opening all students...') : showAll ? 'Show Pages' : 'Show All'}
            </button>
          </div>
        )}
        {viewFilter !== 'completed' && (!showAll || isLargeShowAllList) && totalPages > 1 && (
          <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-700 dark:text-slate-300">{(currentPage - 1) * itemsPerPage + 1}</span>-
              <span className="font-medium text-slate-700 dark:text-slate-300">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">{totalCount}</span> students
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="btn btn-secondary p-2 disabled:opacity-40"
                title="First page"
              >
                <ChevronLeft size={14} />
                <ChevronLeft size={14} className="-ml-2" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary p-2 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              {/* Page number buttons — show up to 5 around current page */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`min-w-[2rem] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === p
                          ? 'text-white shadow-sm'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                      }`}
                      style={currentPage === p ? { backgroundColor: 'var(--primary-color)' } : {}}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn btn-secondary p-2 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="btn btn-secondary p-2 disabled:opacity-40"
                title="Last page"
              >
                <ChevronRight size={14} />
                <ChevronRight size={14} className="-ml-2" />
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

      {showImportModal && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isImporting) closeImportModal();
          }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-[min(92vw,30rem)] max-h-[86vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">
                  Import {viewFilter === 'completed' ? 'School Records' : viewFilter === 'all' ? 'Students' : viewFilter === 'active' ? 'Active Students' : 'Deactivated Students'}
                </h2>
              </div>
              <button onClick={closeImportModal} disabled={isImporting} className="p-1 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50">
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(86vh-56px)]">
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
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload Excel or CSV file</p>
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
                        {expectedFields.map(field => (
                          <tr key={field.key}>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">
                              {field.label}{field.required ? '*' : ''}
                            </td>
                            <td className="px-2 py-1.5">
                              <select
                                value={fieldMapping[field.key] || ''}
                                onChange={(e) => updateKnownFieldMapping(field.key, e.target.value)}
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

                  {csvHeaders.filter(header => !getKnownMappedHeaders().has(header)).length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700/50">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Extra fields</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Rename detected columns to save them as custom student fields, or clear the name to skip.</p>
                      </div>
                      <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                        {csvHeaders.filter(header => !getKnownMappedHeaders().has(header)).map(header => (
                          <div key={header} className="grid grid-cols-[1fr,1.2fr] gap-2 px-3 py-2 items-center">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{header}</p>
                              <p className="text-[10px] text-slate-400">Detected column</p>
                            </div>
                            <input
                              value={customFieldMapping[header] ?? ''}
                              onChange={(e) => setCustomFieldMapping(prev => ({ ...prev, [header]: e.target.value }))}
                              className="form-input py-1 px-2 text-xs"
                              placeholder="Skip or rename"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={closeImportModal} disabled={isImporting} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={previewImportWithDelay} disabled={isPreviewingImport} className="py-1.5 px-3 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-sm font-medium flex items-center gap-1 transition-colors disabled:opacity-70">
                      {isPreviewingImport ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                      {isPreviewingImport ? 'Loading preview...' : 'Preview'}
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'preview' && (
                <div data-preview-fullscreen-root className="flex flex-col h-[calc(86vh-56px)] -m-5 bg-white dark:bg-slate-800">
                  <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="px-1.5 py-0.5 text-white rounded flex items-center gap-1" style={{ backgroundColor: 'var(--solid-emerald)' }}><Check size={10} /> 1</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 text-white rounded flex items-center gap-1" style={{ backgroundColor: 'var(--solid-emerald)' }}><Check size={10} /> 2</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3 Review</span>
                    </div>
                    <div className="flex gap-3 ml-auto">
                      <FullscreenButton />
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-1">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">
                          <strong>{hasImportOverflow ? allowedNewImportCount : newEnrolledImportCount}</strong> import available
                        </p>
                      </div>
                      {hasImportOverflow && (
                        <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-1">
                          <p className="text-sm text-rose-700 dark:text-rose-300">
                            <strong>{newEnrolledImportCount - allowedNewImportCount}</strong> need upgrade
                          </p>
                        </div>
                      )}
                      {Object.keys(flaggedItems).length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1">
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            <strong>{Object.keys(flaggedItems).length}</strong> duplicates
                          </p>
                        </div>
                      )}
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-1">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>{Object.entries(flaggedItems).filter(([, f]) => f.action === 'skip' || f.action === 'replace').length}</strong> not adding
                        </p>
                      </div>
                      {importRemaining !== null && (
                        <div className="bg-slate-100 dark:bg-slate-700 rounded-lg px-3 py-1">
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            <strong>{importRemaining}</strong> remaining
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {planLimitMessage && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-2.5 mx-5 mt-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-red-700 dark:text-red-300">{planLimitMessage}</p>
                        <button
                          type="button"
                          onClick={() => navigate('/plans')}
                          className="py-1.5 px-3 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-xs font-semibold whitespace-nowrap transition-colors"
                        >
                          Upgrade now
                        </button>
                      </div>
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
                          const resolvedClassLabel = (student as any).classId
                            ? getClassDisplayName((student as any).classId, classes.length > 0 ? classes : (classesStoreData as Class[]))
                            : '-';
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
                                    <p className="text-[10px] text-slate-400">ID: {(student as any).studentId || (student as any).admissionNo || (student as any).id}</p>
                                    {Array.isArray((student as any).customFields) && (student as any).customFields.length > 0 && (
                                      <p className="text-[10px] text-sky-500">{(student as any).customFields.length} custom field{(student as any).customFields.length === 1 ? '' : 's'}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="text-slate-700 dark:text-slate-200">{resolvedClassLabel}</div>
                                {(student as any).stream && <div className="text-[10px] text-slate-400">Stream {(student as any).stream}</div>}
                              </td>
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

                  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                    <div className="flex-1 max-w-xs">
                      {isImporting && (
                        <>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full transition-all" style={{ width: `${importProgress}%`, backgroundColor: 'var(--solid-emerald)' }} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{importProgress}% imported</p>
                        </>
                      )}
                    </div>
                    <button onClick={() => setImportStep('map')} className="py-2 px-4 rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600 font-medium transition-colors disabled:opacity-70" disabled={isImporting}>Back to Mapping</button>
                    {hasImportOverflow && allowedNewImportCount > 0 && (
                      <button
                        onClick={() => executeImport(true)}
                        disabled={isImporting}
                        className="py-2 px-4 rounded-lg text-white font-medium flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                        style={{ backgroundColor: 'var(--solid-emerald)' }}
                      >
                        {isImporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                        {isImporting ? 'Importing...' : `Import Available (${allowedNewImportCount})`}
                      </button>
                    )}
                    <button onClick={() => executeImport(false)} disabled={isImporting} className="py-2 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-colors">
                      {isImporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={16} />}
                      {isImporting ? 'Importing...' : 'Import Selected'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {showExportMenu && createPortal(
        <div
          data-students-export-menu="true"
          className="fixed z-[999999] w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl animate-dropdown-in dark:border-slate-700 dark:bg-slate-800"
          style={{ top: exportDropdownPos.top, right: exportDropdownPos.right }}
        >
          <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Exporting: {getExportLabel()}
          </div>
          <button
            onClick={handleExportPDF}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FileText size={14} />
            Export PDF
          </button>
          <button
            onClick={handleExportCSV}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download size={14} />
            Export CSV
          </button>
          <button
            onClick={handleExportExcel}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <FileText size={14} />
            Export Excel
          </button>
        </div>,
        document.body
      )}

      {showBulkImageModal && (
        <BulkImageUpdateModal
          title="Edit Student Images"
          entityLabel="student"
          records={selectedStudentImageRecords}
          onClose={() => setShowBulkImageModal(false)}
          onApply={handleBulkStudentImages}
          onRemove={handleRemoveBulkStudentImages}
        />
      )}
      {(
        <BulkEditClassModal
          isOpen={showBulkEditModal}
          onClose={() => setShowBulkEditModal(false)}
          onSave={async (classId: string) => {
            await handleBulkEditClass(classId);
          }}
          studentCount={selectedStudents.size}
          classes={classes}
          currentClassId={selectedStudents.size === 1 ? students.find(s => selectedStudents.has(s.id))?.classId : undefined}
        />
      )}
      <OperationProgressPopup
        open={operationProgress.open}
        title={operationProgress.title}
        detail={operationProgress.detail}
        progress={operationProgress.progress}
        processed={operationProgress.processed}
        total={operationProgress.total}
      />
    </div>
  );
}










