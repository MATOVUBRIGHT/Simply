import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Eye, Users, Briefcase, Phone, Mail, Download, Upload, FileText, ChevronDown, X, ArrowRight, Check, Square, CheckSquare, UserX, DollarSign, Clock, CheckCircle, Settings, ImagePlus, Loader2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { PaymentMethod, StaffRole } from '@schofy/shared';
import type { Staff, SalaryPayment, Subject } from '@schofy/shared';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import ImageModal from '../components/ImageModal';
import DropdownModal from '../components/DropdownModal';
import { useCurrency } from '../hooks/useCurrency';
import { generateUUID } from '../utils/uuid';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { addToRecycleBin } from '../utils/recycleBin';
import { useTableData } from '../lib/store';
import { useConfirm } from '../components/ConfirmModal';
import { PortalDropdown } from '../components/PortalDropdown';
import { FullscreenButton } from '../components/FullscreenButton';
import { matchesTextSearch } from '../utils/searchMatch';
import { deleteInFortyPercentBatches, runTasksInPercentBatches, runTasksInThirtyPercentBatches } from '../utils/bulkDelete';
import { ProgressiveListLoader, useProgressiveList } from '../hooks/useProgressiveList';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { BulkImageUpdateModal, type BulkImageRecord } from '../components/BulkImageUpdateModal';
import { OperationProgressPopup } from '../components/OperationProgressPopup';
import { getPlanStaffLimit, getSubscriptionAccessState } from '../utils/plans';
import { getImportCellText, parseImportFile } from '../utils/importParser';

const avatarColors = [
  'bg-violet-500',
  'bg-teal-500',
  'bg-amber-500',
  'bg-lime-500',
  'bg-pink-500',
  'bg-sky-500',
  'bg-red-500',
];

function getAvatarColor(name: string) {
  const index = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[index];
}

function normalizeImportHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function StaffActions({
  staff,
  onView,
  onEdit,
  onEmail,
  onDelete,
}: {
  staff: Staff;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onEmail: (email: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); setIsOpen(v => !v); }}
        className={`p-1.5 rounded-lg transition-all ${
          isOpen
            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-500/20'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
        }`}
        title="Actions"
      >
        <Settings size={15} className={isOpen ? 'animate-spin-slow' : ''} />
      </button>

      <PortalDropdown triggerRef={btnRef} isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <PortalDropdown.Item icon={<Eye size={13} />} label="View" onClick={() => { onView(staff.id); setIsOpen(false); }} />
        <PortalDropdown.Divider />
        <PortalDropdown.Item icon={<Edit size={13} />} label="Edit" onClick={() => { onEdit(staff.id); setIsOpen(false); }} />
        {staff.email && (
          <>
            <PortalDropdown.Divider />
            <PortalDropdown.Item icon={<Mail size={13} />} label="Email" onClick={() => { onEmail(staff.email!); setIsOpen(false); }} />
          </>
        )}
        <PortalDropdown.Divider />
        <PortalDropdown.Item icon={<Trash2 size={13} />} label="Delete" danger onClick={() => { onDelete(staff.id); setIsOpen(false); }} />
      </PortalDropdown>
    </>
  );
}

export default function StaffPage() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { data: staffData, loading } = useTableData(sid, 'staff');
  const { data: salaryPaymentsData } = useTableData(sid, 'salaryPayments');
  const { data: subjectsData } = useTableData(sid, 'subjects');

  const staff = useMemo(() =>
    [...staffData].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [staffData]
  ) as Staff[];
  const salaryPayments = salaryPaymentsData as SalaryPayment[];
  const subjects = subjectsData as Subject[];

  const [search, setSearch] = useState('');
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [customFieldMapping, setCustomFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Staff>[]>([]);
  const [selectedImportRows, setSelectedImportRows] = useState<Set<number>>(new Set());
  const [isPreviewingImport, setIsPreviewingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [operationProgress, setOperationProgress] = useState<{ open: boolean; title: string; detail: string; progress: number; processed?: number; total?: number }>({
    open: false,
    title: '',
    detail: '',
    progress: 0,
  });
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showBulkImageModal, setShowBulkImageModal] = useState(false);
  const [staffLimitNotice, setStaffLimitNotice] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [importPlanCapacity, setImportPlanCapacity] = useState<{ planName: string; limit: number; activeStaff: number } | null>(null);
  const rowClickTimeoutRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<SalaryPayment | null>(null);
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));
  const [paymentNotes, setPaymentNotes] = useState('');
  const submittingRef = useRef(false);

  const payrollStats = {
    pending: salaryPayments.filter(p => p.status === 'pending'),
    paid: salaryPayments.filter(p => p.status === 'paid'),
    upcoming: salaryPayments.filter(p => p.status === 'upcoming'),
    pendingTotal: salaryPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
    paidTotal: salaryPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
    upcomingTotal: salaryPayments.filter(p => p.status === 'upcoming').reduce((sum, p) => sum + p.amount, 0),
  };

  async function handleGeneratePayroll() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const [month, year] = payrollMonth.split('-');
      const activeStaff = staff.filter(s => s.status === 'active' && s.salary && s.salary > 0);
      const now = new Date().toISOString();
      let count = 0;

      for (const member of activeStaff) {
        const existing = salaryPayments.find(p => 
          p.staffId === member.id && p.month === month && p.year === parseInt(year)
        );
        if (!existing) {
          const payment: SalaryPayment = {
            id: generateUUID(),
            staffId: member.id,
            staffName: `${member.firstName} ${member.lastName}`,
            amount: member.salary || 0,
            month,
            year: parseInt(year),
            status: 'pending',
            createdAt: now,
          };
          await dataService.create(id, 'salaryPayments', payment as any);
          count++;
        }
      }
      setShowPayrollModal(false);
      addToast(`Generated payroll for ${count} staff members`, 'success');
    } catch (error) {
      console.error('Failed to generate payroll:', error);
      addToast('Failed to generate payroll', 'error');
    }
  }

  async function handleMarkAsPaid(payment: SalaryPayment) {
    const id = schoolId || user?.id;
    if (!id || submittingRef.current) return;
    submittingRef.current = true;
    const updated = { ...payment, status: 'paid', paidAt: new Date().toISOString(), paymentMethod: PaymentMethod.BANK_TRANSFER, notes: paymentNotes || undefined } as any;
    addToast(`Marked ${payment.staffName}'s salary as paid`, 'success');
    setShowPayModal(false);
    setSelectedPayment(null);
    setPaymentNotes('');
    const result = await dataService.update(id, 'salaryPayments', payment.id, updated);
    if (!result.success) {
      addToast('Failed to update payment: ' + result.error, 'error');
    }
    submittingRef.current = false;
  }

  async function handleDeletePayment(paymentId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    const ok = await confirm({
      title: 'Delete Payment Record',
      description: 'Remove this salary payment record? This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await dataService.delete(id, 'salaryPayments', paymentId);
      addToast('Payment record deleted', 'success');
    } catch (error) {
      console.error('Failed to delete payment:', error);
      addToast('Failed to delete payment', 'error');
    }
  }

  function openPayModal(payment: SalaryPayment) {
    setSelectedPayment(payment);
    setShowPayModal(true);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'paid':
        return 'badge-success';
      case 'pending':
        return 'badge-amber';
      case 'upcoming':
        return 'badge-info';
      default:
        return 'badge-gray';
    }
  }

  function getMonthName(month: string) {
    const date = new Date(parseInt(new Date().getFullYear().toString()), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function handleRowSingleClick(staffId: string) {
    if (rowClickTimeoutRef.current) window.clearTimeout(rowClickTimeoutRef.current);
    rowClickTimeoutRef.current = window.setTimeout(() => {
      navigate(`/staff/${staffId}`);
      rowClickTimeoutRef.current = null;
    }, 220);
  }

  function handleRowDoubleClick(staffId: string) {
    if (rowClickTimeoutRef.current) {
      window.clearTimeout(rowClickTimeoutRef.current);
      rowClickTimeoutRef.current = null;
    }
    setSelectMode(true);
    setSelectedStaff(prev => {
      const next = new Set(prev);
      next.has(staffId) ? next.delete(staffId) : next.add(staffId);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedStaff.size === filteredStaff.length) {
      setSelectedStaff(new Set());
    } else {
      setSelectedStaff(new Set(filteredStaff.map(s => s.id)));
    }
  }

  async function handleBulkDelete() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedStaff.size === 0) return;
    const ok = await confirm({
      title: `Delete ${selectedStaff.size} Staff Member${selectedStaff.size > 1 ? 's' : ''}`,
      description: `This will permanently delete ${selectedStaff.size} staff member${selectedStaff.size > 1 ? 's' : ''} and move them to the recycle bin.`,
      confirmLabel: 'Delete All',
      variant: 'danger',
    });
    if (!ok) return;
    
    try {
      const now = new Date().toISOString();
      const idsToDelete = Array.from(selectedStaff);
      const recycleItems = idsToDelete
        .map(staffId => staff.find(s => s.id === staffId))
        .filter(Boolean) as Staff[];

      recycleItems.forEach(staffMember => {
        addToRecycleBin(id, {
            id: `staff-${Date.now()}-${Math.random()}`,
            type: 'staff',
            name: `${staffMember.firstName} ${staffMember.lastName}`,
            data: staffMember,
            deletedAt: now
        });
      });
      setOperationProgress({
        open: true,
        title: 'Deleting staff',
        detail: 'Removing selected records in 40% batches.',
        progress: 5,
        processed: 0,
        total: idsToDelete.length,
      });
      const deletedCount = await deleteInFortyPercentBatches(id, 'staff', idsToDelete, (_deletedIds, deletedTotal, total) => {
        setOperationProgress({
          open: true,
          title: 'Deleting staff',
          detail: 'Removing selected records in 40% batches.',
          progress: Math.round((deletedTotal / total) * 100),
          processed: deletedTotal,
          total,
        });
      });
      
      
      setSelectedStaff(new Set());
      setSelectMode(false);
      addToast(`${deletedCount} staff moved to recycle bin`, 'success');    } catch (error) {
      addToast('Failed to delete staff', 'error');
    } finally {
      window.setTimeout(() => {
        setOperationProgress(prev => prev.title === 'Deleting staff' ? { ...prev, open: false } : prev);
      }, 350);
    }
  }

  async function handleBulkToggleStatus() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (selectedStaff.size === 0) return;
    
    try {
      const now = new Date().toISOString();
      let activated = 0;
      let deactivated = 0;
      
      for (const staffId of selectedStaff) {
        const staffMember = staff.find(s => s.id === staffId);
        if (staffMember) {
          const newStatus = staffMember.status === 'active' ? 'inactive' : 'active';
          await dataService.update(id, 'staff', staffId, { status: newStatus, updatedAt: now } as any);
          if (newStatus === 'active') activated++;
          else deactivated++;
        }
      }
      setSelectedStaff(new Set());
      setSelectMode(false);
      addToast(`${activated} activated, ${deactivated} deactivated`, 'success');
    } catch (error) {
      addToast('Failed to update status', 'error');
    }
  }

  async function handleBulkStaffImages(updates: Array<{ id: string; photoUrl: string }>) {
    const id = schoolId || user?.id;
    if (!id || updates.length === 0) return;
    const now = new Date().toISOString();
    await Promise.all(updates.map(update =>
      dataService.update(id, 'staff', update.id, { photoUrl: update.photoUrl, updatedAt: now } as any)
    ));
    addToast(`Updated ${updates.length} staff image${updates.length === 1 ? '' : 's'}`, 'success');
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'staff' } }));
  }

  async function handleRemoveBulkStaffImages(ids: string[]) {
    const id = schoolId || user?.id;
    if (!id || ids.length === 0) return;
    const now = new Date().toISOString();
    await Promise.all(ids.map(staffId =>
      dataService.update(id, 'staff', staffId, { photoUrl: null, updatedAt: now } as any)
    ));
    addToast(`Removed ${ids.length} staff image${ids.length === 1 ? '' : 's'}`, 'success');
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'staff' } }));
  }

  const getStaffSubjects = useMemo(() => {
    const byStaffId = new Map<string, Subject[]>();
    const subjectKey = (subject: Subject) => {
      const code = String((subject as any).code || (subject as any).subjectCode || '').trim().toLowerCase();
      const name = String((subject as any).name || (subject as any).subjectName || '').trim().toLowerCase();
      return code || name || String(subject.id);
    };

    for (const subject of subjects) {
      const teacherId = (subject as any).teacherId;
      if (!teacherId) continue;
      const list = byStaffId.get(teacherId) || [];
      list.push(subject);
      byStaffId.set(teacherId, list);
    }

    return (staffMember: Staff) => {
      const assignedSubjectIds = new Set((staffMember.subjects || []).map(String));
      const merged = new Map<string, Subject>();
      (byStaffId.get(staffMember.id) || []).forEach(subject => merged.set(subjectKey(subject), subject));
      subjects
        .filter(subject => assignedSubjectIds.has(String(subject.id)))
        .forEach(subject => merged.set(subjectKey(subject), subject));
      return Array.from(merged.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    };
  }, [subjects]);

  const getStaffSubjectSummary = useCallback((staffMember: Staff) => {
    const names = getStaffSubjects(staffMember).map(subject => subject.name).filter(Boolean);
    if (names.length === 0) return 'No subjects assigned';
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
  }, [getStaffSubjects]);

  const filteredStaff = useMemo(() => staff.filter((s) =>
    matchesTextSearch([s.firstName, s.lastName, `${s.firstName} ${s.lastName}`, `${s.lastName} ${s.firstName}`, s.employeeId, s.email, s.phone, getStaffSubjectSummary(s)], search)
  ), [staff, search, getStaffSubjectSummary]);
  const allFilteredStaffSelected = filteredStaff.length > 0 && selectedStaff.size === filteredStaff.length;
  const selectedStaffImageRecords = useMemo<BulkImageRecord[]>(() => filteredStaff
    .filter(member => selectedStaff.has(member.id))
    .map(member => ({
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      primaryId: member.employeeId,
      secondaryId: member.email,
      label: `${member.firstName} ${member.lastName}`,
    })), [filteredStaff, selectedStaff]);
  const filteredTeachers = useMemo(() => filteredStaff.filter(s => s.role === StaffRole.TEACHER), [filteredStaff]);
  const staffProgress = useProgressiveList(filteredStaff, { initialCount: 120, step: 120, delayMs: 2000 });
  const visibleStaff = staffProgress.visibleItems;
  const listLoading = useMinimumLoading(loading, 2000);

  async function handleDelete(id: string) {
    const authId = schoolId || user?.id;
    if (!authId) return;
    const staffMember = staff.find(s => s.id === id);
    const name = staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : 'this staff member';
    const ok = await confirm({
      title: 'Delete Staff Member',
      description: `Delete ${name}? They will be moved to the recycle bin.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    if (staffMember) {
      addToRecycleBin(authId, { id: `staff-${Date.now()}`, type: 'staff', name: `${staffMember.firstName} ${staffMember.lastName}`, data: staffMember, deletedAt: new Date().toISOString() });
    }
    addToast('Staff member moved to recycle bin', 'success');
    const result = await dataService.delete(authId, 'staff', id);
    if (!result.success) addToast('Failed to delete: ' + result.error, 'error');
  }

  const staffCSVColumns = [
    { key: 'employeeId' as keyof Staff, label: 'Employee ID' },
    { key: 'firstName' as keyof Staff, label: 'First Name' },
    { key: 'lastName' as keyof Staff, label: 'Last Name' },
    { key: 'role' as keyof Staff, label: 'Role' },
    { key: 'department' as keyof Staff, label: 'Department' },
    { key: 'phone' as keyof Staff, label: 'Phone' },
    { key: 'email' as keyof Staff, label: 'Email' },
    { key: 'address' as keyof Staff, label: 'Address' },
  ];

  const staffPDFColumns = [
    { key: 'employeeId', label: 'Emp ID' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'role', label: 'Role' },
    { key: 'department', label: 'Department' },
    { key: 'phone', label: 'Phone' },
    { key: 'status', label: 'Status' },
  ];

  const staffExpectedFields = [
    { key: 'employeeId', label: 'Employee ID', required: false, aliases: ['id', 'staff id', 'staff no', 'staff number', 'employee no', 'employee number', 'id number'] },
    { key: 'firstName', label: 'First Name', required: true, aliases: ['firstname', 'given name', 'forename', 'name', 'staff name', 'employee name', 'full name'] },
    { key: 'lastName', label: 'Last Name', required: true, aliases: ['lastname', 'surname', 'family name'] },
    { key: 'role', label: 'Role', required: false, aliases: ['staff role', 'position', 'job title', 'designation'] },
    { key: 'department', label: 'Department', required: false, aliases: ['section', 'unit', 'faculty'] },
    { key: 'phone', label: 'Phone', required: false, aliases: ['phone number', 'mobile', 'mobile number', 'contact', 'contact number'] },
    { key: 'email', label: 'Email', required: false, aliases: ['email address', 'staff email', 'work email'] },
    { key: 'address', label: 'Address', required: false, aliases: ['home address', 'residence'] },
    { key: 'dob', label: 'Date of Birth', required: false, aliases: ['birth date', 'birthday', 'date birth'] },
    { key: 'salary', label: 'Salary', required: false, aliases: ['monthly salary', 'pay', 'wage', 'basic salary'] },
    { key: 'joinDate', label: 'Join Date', required: false, aliases: ['joining date', 'date joined', 'employment date', 'start date', 'hire date'] },
    { key: 'qualification', label: 'Qualification', required: false, aliases: ['qualifications', 'education', 'academic qualification'] },
    { key: 'status', label: 'Status', required: false, aliases: ['active status', 'employment status'] },
    { key: 'subjects', label: 'Subjects', required: false, aliases: ['subject', 'teaching subjects', 'assigned subjects'] },
    { key: 'photoUrl', label: 'Photo URL', required: false, aliases: ['photo', 'image', 'picture', 'profile photo'] },
  ];
  const staffImportDraftKey = sid ? `schofy_staff_import_draft_${sid}` : '';

  function clearStaffImportDraft() {
    if (staffImportDraftKey) localStorage.removeItem(staffImportDraftKey);
    setDraftNotice(null);
  }

  function saveStaffImportDraft(reason = 'Staff import draft saved') {
    if (!staffImportDraftKey || csvHeaders.length === 0) return;
    localStorage.setItem(staffImportDraftKey, JSON.stringify({
      savedAt: new Date().toISOString(),
      reason,
      importStep,
      csvHeaders,
      csvData,
      fieldMapping,
      customFieldMapping,
      importPreview,
      selectedImportRows: Array.from(selectedImportRows),
      staffLimitNotice,
      importPlanCapacity,
    }));
    setDraftNotice(reason);
  }

  useEffect(() => {
    if (!staffImportDraftKey || showImportModal || csvHeaders.length > 0) return;
    try {
      const rawDraft = localStorage.getItem(staffImportDraftKey);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft);
      if (!Array.isArray(draft.csvHeaders) || !Array.isArray(draft.csvData)) return;
      setCsvHeaders(draft.csvHeaders);
      setCsvData(draft.csvData);
      setFieldMapping(draft.fieldMapping || {});
      setCustomFieldMapping(draft.customFieldMapping || {});
      setImportPreview(Array.isArray(draft.importPreview) ? draft.importPreview : []);
      setSelectedImportRows(new Set(Array.isArray(draft.selectedImportRows) ? draft.selectedImportRows.filter((value: unknown) => Number.isInteger(value as number)) : []));
      setStaffLimitNotice(draft.staffLimitNotice || null);
      setImportPlanCapacity(draft.importPlanCapacity || null);
      setImportStep(draft.importStep === 'preview' || draft.importStep === 'map' ? draft.importStep : 'map');
      setShowImportModal(true);
      setDraftNotice('Staff import draft restored where you stopped.');
      addToast('Staff import draft restored', 'info');
    } catch (error) {
      console.error('Failed to restore staff import draft:', error);
      clearStaffImportDraft();
    }
  }, [staffImportDraftKey]);

  useEffect(() => {
    if (!showImportModal || isImporting || importStep === 'upload' || csvHeaders.length === 0) return;
    saveStaffImportDraft('Staff import draft saved');
  }, [showImportModal, importStep, csvHeaders, csvData, fieldMapping, customFieldMapping, importPreview, selectedImportRows, staffLimitNotice, importPlanCapacity, isImporting]);

  function handleExportCSV() {
    exportToCSV(filteredStaff, 'staff', staffCSVColumns);
    addToast('Staff exported to CSV', 'success');
  }

  function handleExportPDF() {
    exportToPDF('Staff Report', filteredStaff, staffPDFColumns, 'staff');
    addToast('Staff exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    exportToExcel(filteredStaff, 'staff', staffCSVColumns);
    addToast('Staff exported to Excel', 'success');
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
    const headers = staffExpectedFields.map(f => f.label);
    const sampleRow = staffExpectedFields.map(f => {
      switch (f.key) {
        case 'employeeId': return 'EMP-001';
        case 'firstName': return 'John';
        case 'lastName': return 'Doe';
        case 'role': return 'teacher';
        case 'department': return 'Academic';
        case 'phone': return '0771234567';
        case 'email': return 'john.doe@school.com';
        case 'address': return '123 Main Street';
        case 'dob': return '1988-05-20';
        case 'salary': return '750000';
        case 'joinDate': return '2024-01-15';
        case 'qualification': return 'Diploma in Education';
        case 'status': return 'active';
        case 'subjects': return 'Mathematics; Science';
        case 'photoUrl': return '';
        default: return '';
      }
    });
    import('xlsx').then(({ utils, writeFile }) => {
      const ws = utils.aoa_to_sheet([headers, sampleRow]);
      ws['!cols'] = headers.map(() => ({ wch: 22 }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Staff');
      writeFile(wb, 'staff-import-template.xlsx');
      addToast('Excel template downloaded', 'success');
    });
  }

  function closeImportModal(clearDraft = true) {
    setShowImportModal(false);
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvData([]);
    setFieldMapping({});
    setCustomFieldMapping({});
    setImportPreview([]);
    setSelectedImportRows(new Set());
    setIsPreviewingImport(false);
    setIsImporting(false);
    setImportProgress(0);
    setStaffLimitNotice(null);
    setImportPlanCapacity(null);
    if (clearDraft) clearStaffImportDraft();
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      staffExpectedFields.forEach(field => {
        const candidates = [
          field.key,
          field.label,
          ...((field as any).aliases || []),
        ].map(normalizeImportHeader).filter(Boolean);
        const matchingHeader = normalizedHeaders.find(({ normalized }) =>
          candidates.some(candidate => normalized === candidate || normalized.includes(candidate) || candidate.includes(normalized))
        );
        if (matchingHeader) autoMapping[field.key] = matchingHeader.header;
      });
      const mappedHeaders = new Set(Object.values(autoMapping).filter(Boolean));
      const autoCustomMapping: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (!header || mappedHeaders.has(header)) return;
        autoCustomMapping[header] = getDefaultCustomImportLabel(header, index);
      });
      setFieldMapping(autoMapping);
      setCustomFieldMapping(autoCustomMapping);
      setSelectedImportRows(new Set());
      setImportStep('map');
      setShowImportModal(true);
      window.setTimeout(() => saveStaffImportDraft('Staff import draft started'), 0);
    } catch (error) {
      console.error('Staff import file read error:', error);
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
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else current += char;
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
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else current += char;
    }
    result.push(current.trim());
    return result;
  }

  function normalizeImportId(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function getDefaultCustomImportLabel(header: string, index: number) {
    const clean = String(header || '').trim();
    if (!clean || /^column\s+\d+$/i.test(clean)) return `Generated Field ${index + 1}`;
    return clean;
  }

  function normalizeImportedStaffRole(value: unknown): StaffRole {
    const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (['teacher', 'teach', 'tr', 'tutor'].includes(normalized)) return StaffRole.TEACHER;
    if (['admin', 'administrator'].includes(normalized)) return StaffRole.ADMIN;
    if (['director', 'headteacher', 'headmaster', 'principal'].includes(normalized)) return StaffRole.DIRECTOR;
    if (['accountant', 'accounts', 'bursar', 'finance'].includes(normalized)) return StaffRole.BURSAR;
    if (['support', 'librarian', 'library', 'receptionist', 'reception', 'frontdesk'].includes(normalized)) return StaffRole.SUPPORT;
    return StaffRole.TEACHER;
  }

  function normalizeImportedStaffStatus(value: unknown): 'active' | 'inactive' {
    const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (['inactive', 'disabled', 'deactivated', 'terminated', 'left', 'former', '0', 'false', 'no'].includes(normalized)) return 'inactive';
    return 'active';
  }

  function parseImportedSubjects(value: unknown): string[] | undefined {
    const subjects = getImportCellText(value)
      .split(/[;,|]/)
      .map(subject => subject.trim())
      .filter(Boolean);
    return subjects.length > 0 ? subjects : undefined;
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

  async function processMapping() {
    const mappedData: Partial<Staff>[] = [];
    const headerIndexByName = new Map(csvHeaders.map((header, index) => [header, index]));
    const fieldIndexes = staffExpectedFields.map(field => ({
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
    for (const row of csvData) {
      const staffMember: Partial<Staff> = {};
      fieldIndexes.forEach(field => {
        if (field.index === -1) return;
        const value = getImportCellText(row[field.index]);
        if (!value) return;
        if (field.key === 'salary') {
          const amount = Number(value.replace(/,/g, ''));
          if (Number.isFinite(amount)) (staffMember as any).salary = amount;
          return;
        }
        if (field.key === 'subjects') {
          const parsed = parseImportedSubjects(value);
          if (parsed) (staffMember as any).subjects = parsed;
          return;
        }
        if (field.key === 'status') {
          (staffMember as any).status = normalizeImportedStaffStatus(value);
          return;
        }
        (staffMember as any)[field.key] = value;
      });
      if ((staffMember as any).firstName && !(staffMember as any).lastName) {
        const mappedFirstHeader = fieldMapping.firstName || '';
        const looksLikeFullName = ['name', 'staffname', 'employeename', 'fullname'].includes(normalizeImportHeader(mappedFirstHeader));
        if (looksLikeFullName) {
          const parts = getImportCellText((staffMember as any).firstName).split(/\s+/).filter(Boolean);
          if (parts.length > 1) {
            (staffMember as any).firstName = parts.shift() || '';
            (staffMember as any).lastName = parts.join(' ');
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
        (staffMember as any).customFields = customFields;
      }
      if (staffMember.firstName || staffMember.lastName || staffMember.employeeId) {
        mappedData.push(staffMember);
      }
    }
    setImportPreview(mappedData);
    setSelectedImportRows(new Set(mappedData.map((_, index) => index)));
    setStaffLimitNotice(null);
    const capacity = await getStaffPlanCapacity();
    if (capacity && !capacity.ok) {
      setImportPlanCapacity(null);
      setStaffLimitNotice(`${capacity.message} Current plan: ${capacity.planName}. Upgrade to continue.`);
    } else if (capacity?.ok) {
      setImportPlanCapacity({ planName: capacity.planName, limit: capacity.limit, activeStaff: capacity.activeStaff });
      const existingEmployeeIds = new Set(staff.map(member => normalizeImportId(member.employeeId)).filter(Boolean));
      const newActiveStaffCount = mappedData.filter(member => {
        const employeeId = normalizeImportId((member as any).employeeId);
        const isExisting = employeeId && existingEmployeeIds.has(employeeId);
        return !isExisting && ((member as any).status || 'active') !== 'inactive';
      }).length;
      const projectedStaff = capacity.activeStaff + newActiveStaffCount;
      const remaining = Math.max(0, capacity.limit - capacity.activeStaff);
      if (projectedStaff > capacity.limit) {
        const existingOrInactiveCount = mappedData.filter(member => !isNewActiveImportRow(member)).length;
        const availableRecordCount = existingOrInactiveCount + remaining;
        setStaffLimitNotice(`Current plan: ${capacity.planName}. Staff limit is ${capacity.limit.toLocaleString()} as a separate staff benefit, with ${remaining.toLocaleString()} new active staff slot${remaining === 1 ? '' : 's'} remaining. This import adds ${newActiveStaffCount.toLocaleString()} new active staff. Import available for plan: ${availableRecordCount.toLocaleString()} record${availableRecordCount === 1 ? '' : 's'}; upgrade for the rest.`);
      }
    } else {
      setImportPlanCapacity(null);
    }
    setImportStep('preview');
  }

  async function previewStaffImportWithDelay() {
    if (isPreviewingImport) return;
    setIsPreviewingImport(true);
    try {
      await new Promise(resolve => window.setTimeout(resolve, 2000));
      await processMapping();
    } finally {
      setIsPreviewingImport(false);
    }
  }

  async function getStaffPlanCapacity() {
    const id = schoolId || user?.id;
    if (!id) return null;
    const access = await getSubscriptionAccessState(id, undefined, { authUserId: user?.id });
    if (!access.plan || access.status === 'incomplete' || access.status === 'expired') {
      return { ok: false as const, message: 'Choose an active plan before adding staff.', planName: access.plan?.name || 'No active plan', limit: 0, activeStaff: staff.filter(s => s.status !== 'inactive').length };
    }
    const limit = getPlanStaffLimit(access.plan);
    const activeStaff = staff.filter(s => s.status !== 'inactive').length;
    return { ok: true as const, planName: access.plan.name, limit, activeStaff };
  }

  function getExistingStaffByEmployeeId() {
    const existingByEmployeeId = new Map<string, Staff>();
    staff.forEach(member => {
      const key = normalizeImportId(member.employeeId);
      if (key && !existingByEmployeeId.has(key)) existingByEmployeeId.set(key, member);
    });
    return existingByEmployeeId;
  }

  function isNewActiveImportRow(member: Partial<Staff>, existingByEmployeeId = getExistingStaffByEmployeeId()) {
    const employeeId = normalizeImportId((member as any).employeeId);
    const isExisting = employeeId && existingByEmployeeId.has(employeeId);
    return !isExisting && ((member as any).status || 'active') !== 'inactive';
  }

  function getSelectedImportPreviewRows() {
    return importPreview.filter((_, index) => selectedImportRows.has(index));
  }

  function getAvailableStaffImportRows() {
    return Promise.resolve(getAvailableStaffImportRowsForCapacity(importPlanCapacity));
  }

  function getAvailableStaffImportRowsForCapacity(capacity: { limit: number; activeStaff: number } | null) {
    const existingByEmployeeId = getExistingStaffByEmployeeId();
    const selectedRows = getSelectedImportPreviewRows();
    if (!capacity) return [];
    let remainingNewActive = Math.max(0, capacity.limit - capacity.activeStaff);
    return selectedRows.filter(member => {
      if (!isNewActiveImportRow(member, existingByEmployeeId)) return true;
      if (remainingNewActive <= 0) return false;
      remainingNewActive -= 1;
      return true;
    });
  }

  function toggleImportRow(index: number) {
    setSelectedImportRows(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  function setAllImportRowsSelected(selected: boolean) {
    setSelectedImportRows(selected ? new Set(importPreview.map((_, index) => index)) : new Set());
  }

  async function proceedWithAvailableStaffImport() {
    let rows: Partial<Staff>[] = [];
    const capacity = await getStaffPlanCapacity();
    if (capacity?.ok) {
      const nextCapacity = { planName: capacity.planName, limit: capacity.limit, activeStaff: capacity.activeStaff };
      setImportPlanCapacity(nextCapacity);
      rows = getAvailableStaffImportRowsForCapacity(nextCapacity);
    } else if (capacity) {
      setImportPlanCapacity({ planName: capacity.planName, limit: capacity.limit, activeStaff: capacity.activeStaff });
    }
    if (rows.length === 0) {
      addToast('No available staff slots on the current plan. Upgrade to import more active staff.', 'error');
      return;
    }
    if (rows.length < getSelectedImportPreviewRows().length) {
      addToast(`Proceeding with ${rows.length} available staff record${rows.length === 1 ? '' : 's'}; extra new active staff will be skipped.`, 'info');
    }
    await executeImport(rows);
  }

  async function handleAddStaffClick() {
    try {
      const capacity = await getStaffPlanCapacity();
      if (!capacity) return;
      if (!capacity.ok) {
        setStaffLimitNotice(`${capacity.message} Current plan: ${capacity.planName}. Upgrade to continue.`);
        addToast(`${capacity.message} Current plan: ${capacity.planName}.`, 'error');
        navigate('/plans');
        return;
      }
      if (capacity.activeStaff >= capacity.limit) {
        const message = `Staff limit reached on ${capacity.planName}. This plan allows ${capacity.limit.toLocaleString()} staff as a separate staff benefit. Upgrade to add more staff.`;
        setStaffLimitNotice(message);
        addToast(message, 'error');
        navigate('/plans');
        return;
      }
      navigate('/staff/new');
    } catch {
      addToast('Could not check plan limit. Try again.', 'error');
    }
  }

  async function executeImport(rowsOverride?: Partial<Staff>[]) {
    const id = schoolId || user?.id;
    if (!id || submittingRef.current) return;
    const rowsToImport = rowsOverride || getSelectedImportPreviewRows();
    if (rowsToImport.length === 0) { addToast('Select at least one staff record to import', 'error'); return; }
    setIsImporting(true);
    setImportProgress(0);
    setOperationProgress({
      open: true,
      title: 'Importing staff',
      detail: 'Preparing records in 40% phase.',
      progress: 5,
      processed: 0,
      total: rowsToImport.length,
    });
    submittingRef.current = true;
    try {
      const now = new Date().toISOString();
      let successCount = 0;
      const newStaff: Staff[] = [];
      const updates: Array<{ id: string; data: Partial<Staff> }> = [];
      const existingByEmployeeId = getExistingStaffByEmployeeId();
      const mergeCustomFields = (existingStaff: Partial<Staff> | undefined, incomingFields: any[] = []) => {
        const byLabel = new Map<string, any>();
        ((existingStaff as any)?.customFields || []).forEach((field: any) => {
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
      for (const data of rowsToImport) {
        const employeeId = (data.employeeId as string) || `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const existing = existingByEmployeeId.get(normalizeImportId(employeeId));
        const staffMember: Staff = {
          id: crypto.randomUUID(), schoolId: id,
          employeeId,
          firstName: (data.firstName as string) || 'Unknown',
          lastName: (data.lastName as string) || 'Unknown',
          role: normalizeImportedStaffRole(data.role),
          department: data.department, phone: (data.phone as string) || '',
          email: data.email as string | undefined, address: data.address as string | undefined,
          dob: data.dob as string | undefined,
          salary: typeof (data as any).salary === 'number' ? (data as any).salary : undefined,
          joinDate: (data as any).joinDate as string | undefined,
          qualification: (data as any).qualification as string | undefined,
          photoUrl: (data as any).photoUrl as string | undefined,
          subjects: Array.isArray((data as any).subjects) ? (data as any).subjects : undefined,
          customFields: Array.isArray((data as any).customFields) ? (data as any).customFields : undefined,
          status: ((data as any).status as 'active' | 'inactive') || 'active',
          createdAt: now,
          updatedAt: now,
        };
        if (existing) {
          const updateData = {
            ...staffMember,
            id: existing.id,
            schoolId: existing.schoolId || id,
            createdAt: existing.createdAt || now,
            updatedAt: now,
          };
          if (Array.isArray((data as any).customFields) && (data as any).customFields.length > 0) {
            (updateData as any).customFields = mergeCustomFields(existing, (data as any).customFields);
          }
          updates.push({
            id: existing.id,
            data: updateData,
          });
        } else {
          newStaff.push(staffMember);
        }
        successCount++;
      }
      const promptDraftUpgrade = async (message: string) => {
        saveStaffImportDraft('Staff import draft saved before upgrade');
        const goUpgrade = await confirm({
          title: 'Staff Import Draft Saved',
          description: `${message} Your import draft has been saved and will reopen here when you return to Staff.`,
          confirmLabel: 'Upgrade Plan',
          cancelLabel: 'Stay Here',
          variant: 'warning',
        });
        if (goUpgrade) {
          closeImportModal(false);
          navigate('/plans');
        }
      };
      const capacity = await getStaffPlanCapacity();
      if (!capacity) return;
      if (!capacity.ok) {
        const message = `${capacity.message} Current plan: ${capacity.planName}. Upgrade to continue.`;
        setStaffLimitNotice(message);
        addToast(message, 'error');
        await promptDraftUpgrade(message);
        return;
      }
      const newActiveStaffCount = newStaff.filter(member => member.status !== 'inactive').length;
      const projectedStaff = capacity.activeStaff + newActiveStaffCount;
      if (projectedStaff > capacity.limit) {
        const remaining = Math.max(0, capacity.limit - capacity.activeStaff);
        const message = `Staff import exceeds ${capacity.planName}. This plan allows ${capacity.limit.toLocaleString()} staff as a separate staff benefit, with ${remaining.toLocaleString()} slot${remaining === 1 ? '' : 's'} remaining. Upgrade your plan to import ${newActiveStaffCount.toLocaleString()} new active staff.`;
        setStaffLimitNotice(message);
        addToast(message, 'error');
        await promptDraftUpgrade(message);
        return;
      }
      setImportProgress(40);
      setOperationProgress({
        open: true,
        title: 'Importing staff',
        detail: 'Saving new staff records.',
        progress: 40,
        processed: newStaff.length,
        total: rowsToImport.length,
      });
      let importedStaffCount = 0;
      let skippedByPlanCount = 0;
      if (newStaff.length > 0) {
        const createResult = await dataService.bulkCreate(id, 'staff', newStaff as any[]);
        importedStaffCount = createResult.imported;
        skippedByPlanCount = Math.max(0, newStaff.length - createResult.imported);
        if (skippedByPlanCount > 0 && createResult.error) {
          setStaffLimitNotice(createResult.error);
          addToast(createResult.error, 'warning');
        }
      }
      setImportProgress(80);
      setOperationProgress({
        open: true,
        title: 'Importing staff',
        detail: 'Replacing matching staff records.',
        progress: 80,
        processed: importedStaffCount,
        total: rowsToImport.length,
      });
      await runTasksInPercentBatches(
        updates.map(update => () => dataService.update(id, 'staff', update.id, update.data as any)),
        0.4,
        (_progress, processed) => {
          setOperationProgress({
            open: true,
            title: 'Importing staff',
            detail: 'Replacing matching staff records.',
            progress: Math.min(99, 80 + Math.round((processed / Math.max(1, updates.length)) * 19)),
            processed: importedStaffCount + processed,
            total: rowsToImport.length,
          });
        },
      );
      setImportProgress(100);
      setOperationProgress({
        open: true,
        title: 'Importing staff',
        detail: 'Import complete.',
        progress: 100,
        processed: importedStaffCount + updates.length,
        total: rowsToImport.length,
      });
      const parts: string[] = [];
      if (importedStaffCount > 0) parts.push(`${importedStaffCount} imported`);
      if (updates.length > 0) parts.push(`${updates.length} replaced`);
      if (skippedByPlanCount > 0) parts.push(`${skippedByPlanCount} skipped by plan`);
      addToast(parts.join(', ') || 'Import complete', skippedByPlanCount > 0 ? 'warning' : 'success');
      if (skippedByPlanCount === 0) {
        clearStaffImportDraft();
        closeImportModal(false);
      } else {
        saveStaffImportDraft('Staff import draft saved with skipped rows');
      }
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'staff' } }));
    } catch (error) {
      addToast('Failed to import staff', 'error');
    } finally {
      setIsImporting(false);
      submittingRef.current = false;
      window.setTimeout(() => {
        setOperationProgress(prev => prev.title === 'Importing staff' ? { ...prev, open: false } : prev);
      }, 450);
    }
  }

  const [showTeachersPanel, setShowTeachersPanel] = useState(false);
  const confirm = useConfirm();

  const teachersCount = staff.filter(s => s.role === 'teacher').length;
  const activeCount = staff.filter(s => s.status === 'active').length;
  const selectedImportPreviewRows = getSelectedImportPreviewRows();
  const selectedImportCount = selectedImportPreviewRows.length;
  const allImportRowsSelected = importPreview.length > 0 && selectedImportRows.size === importPreview.length;
  const selectedNewActiveImportCount = selectedImportPreviewRows.filter(member => isNewActiveImportRow(member)).length;
  const availableStaffImportRows = getAvailableStaffImportRowsForCapacity(importPlanCapacity);
  const availableStaffImportCount = availableStaffImportRows.length;
  const availableNewActiveImportCount = availableStaffImportRows.filter(member => isNewActiveImportRow(member)).length;
  const skippedStaffImportCount = Math.max(0, selectedImportCount - availableStaffImportCount);
  const remainingStaffSlots = importPlanCapacity ? Math.max(0, importPlanCapacity.limit - importPlanCapacity.activeStaff) : 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Staff Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage teachers and staff</p>
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
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".csv,.xlsx,.xls" className="hidden" />
          <button type="button" onClick={handleAddStaffClick} className="btn btn-primary">
            <Plus size={16} />
            Add Staff
          </button>
        </div>
      </div>

      {staffLimitNotice && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200">
          {staffLimitNotice}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-solid-purple p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Total Staff</p>
              <p className="text-2xl font-bold text-white">{filteredStaff.length}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer" onClick={() => setShowTeachersPanel(v => !v)}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Briefcase size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Teachers</p>
              <p className="text-2xl font-bold text-white">{teachersCount}</p>
              <p className="text-xs text-white/60 mt-0.5">{showTeachersPanel ? 'Click to hide' : 'Click to view'}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Users size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Active</p>
              <p className="text-2xl font-bold text-white">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-amber p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all cursor-pointer" onClick={() => navigate('/payroll')}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <DollarSign size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Payroll</p>
              <p className="text-2xl font-bold text-white">{payrollStats.pending.length}</p>
              <p className="text-xs text-white/70">Pending</p>
            </div>
          </div>
        </div>
      </div>

      {/* Teachers Panel — only shown when Teachers card is clicked */}
      {showTeachersPanel && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Briefcase size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">Teachers</h3>
                <p className="text-xs text-slate-500">Teaching staff overview</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/payroll')} className="btn btn-secondary text-sm">
                <DollarSign size={16} /> Payroll
              </button>
              <button onClick={() => navigate('/staff/new')} className="btn btn-primary text-sm">
                <Plus size={16} /> Add Teacher
              </button>
              <button onClick={() => setShowTeachersPanel(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-400">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="card-body">
            {filteredTeachers.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 font-medium">No teachers found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTeachers.map((teacher) => (
                  <div key={teacher.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${getAvatarColor(teacher.firstName)} flex items-center justify-center`}>
                        <span className="text-xs font-bold text-white">{teacher.firstName?.charAt(0)}{teacher.lastName?.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-white text-sm">{teacher.firstName} {teacher.lastName}</p>
                        <p className="text-xs text-slate-500">{teacher.email || teacher.phone || 'No contact'}</p>
                        <p className="mt-0.5 max-w-[360px] truncate text-xs font-medium text-indigo-600 dark:text-indigo-300">{getStaffSubjectSummary(teacher)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${teacher.status === 'active' ? 'badge-success' : 'badge-gray'} text-xs`}>{teacher.status}</span>
                      {teacher.salary && <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{formatMoney(teacher.salary)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="card">
        <div className="card-header">
          <div className="relative w-full">
            <Search size={18} className="search-input-icon" />
            <input
              type="text"
              placeholder="Search by name or employee ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="table-container">
          {selectMode && selectedStaff.size > 0 && (
            <div className="px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-200 dark:border-violet-800 flex items-center justify-between">
              <span className="text-sm text-violet-700 dark:text-violet-300 font-medium">
                {selectedStaff.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                >
                  {selectedStaff.size === filteredStaff.length ? 'Deselect All' : 'Select All'}
                </button>
                {allFilteredStaffSelected && (
                  <button
                    onClick={() => setShowBulkImageModal(true)}
                    className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center gap-1"
                  >
                    <ImagePlus size={12} />
                    Edit Images
                  </button>
                )}
                <button
                  onClick={handleBulkToggleStatus}
                  className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-1"
                >
                  <UserX size={12} />
                  Toggle Status
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
                <button
                  onClick={() => { setSelectedStaff(new Set()); setSelectMode(false); }}
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
                <th className="w-10">#</th>
                {selectMode && <th className="w-10">
                  <button onClick={handleSelectAll} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                    {selectedStaff.size === filteredStaff.length && filteredStaff.length > 0 ? (
                      <CheckSquare size={16} className="text-primary-600" />
                    ) : (
                      <Square size={16} className="text-slate-400" />
                    )}
                  </button>
                </th>}
                <th>Staff Member</th>
                <th>Employee ID</th>
                <th>Role</th>
                <th>Subjects</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={selectMode ? 9 : 8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <div className="w-8 h-8 border-2 border-slate-200 border-t-transparent rounded-full animate-spin" style={{ borderTopColor: 'var(--primary-color)' }}></div>
                      <p className="text-sm">Loading...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={selectMode ? 9 : 8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Users size={24} className="text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">No staff found</p>
                      <Link to="/staff/new" className="text-violet-500 hover:text-violet-600 text-sm font-medium">
                        Add your first staff member
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleStaff.map((s, index) => (
                  <tr 
                    key={s.id}
                    className={`group cursor-pointer transition-colors ${selectedStaff.has(s.id) ? 'bg-violet-50 dark:bg-violet-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                    onClick={() => handleRowSingleClick(s.id)}
                    onDoubleClick={() => handleRowDoubleClick(s.id)}
                  >
                    <td className="text-center text-xs text-slate-400 dark:text-slate-500">
                      {index + 1}
                    </td>
                    {selectMode && (
                      <td className="text-center">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedStaff.has(s.id) 
                            ? 'bg-violet-600 border-violet-600' 
                            : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {selectedStaff.has(s.id) && (
                            <Check size={12} className="text-white" />
                          )}
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="flex items-center gap-3">
                        {s.photoUrl ? (
                          <button 
                            onClick={(event) => {
                              event.stopPropagation();
                              setPreviewImage({ src: s.photoUrl!, alt: `${s.firstName} ${s.lastName}` });
                            }}
                            className="w-9 h-9 rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all"
                          >
                            <img 
                              src={s.photoUrl} 
                              alt={`${s.firstName} ${s.lastName}`}
                              className="w-full h-full object-cover object-top"
                            />
                          </button>
                        ) : (
                          <div className={`w-9 h-9 rounded-lg ${getAvatarColor(s.firstName)} flex items-center justify-center`}>
                            <span className="text-xs font-bold text-white">
                              {s.firstName[0]}{s.lastName[0]}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">
                            {s.firstName} {s.lastName}
                          </p>
                          <p className="text-xs text-slate-400">{s.department || 'Staff Member'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-xs text-slate-700 dark:text-slate-300">
                      {s.employeeId}
                    </td>
                    <td>
                      <span className="badge badge-violet capitalize">{s.role}</span>
                    </td>
                    <td className="max-w-[220px]">
                      <p className="truncate text-xs font-medium text-slate-600 dark:text-slate-300" title={getStaffSubjects(s).map(subject => subject.name).join(', ')}>
                        {s.role === StaffRole.TEACHER ? getStaffSubjectSummary(s) : '-'}
                      </p>
                    </td>
                    <td>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <Phone size={12} className="text-slate-400" />
                          <span>{s.phone || 'N/A'}</span>
                        </div>
                        {s.email && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate max-w-[140px]">
                            <Mail size={12} />
                            <span>{s.email}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'active' ? 'badge-success' : 'badge-gray'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <StaffActions
                        staff={s}
                        onView={(staffId) => navigate(`/staff/${staffId}`)}
                        onEdit={(staffId) => navigate(`/staff/${staffId}/edit`)}
                        onEmail={(email) => window.open(`mailto:${email}`, '_blank')}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <ProgressiveListLoader hasMore={staffProgress.hasMore} loadingMore={staffProgress.loadingMore} onVisible={staffProgress.loadMore} />
        </div>
      </div>
      {previewImage && (
        <ImageModal 
          src={previewImage.src} 
          alt={previewImage.alt} 
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}

      {showBulkImageModal && (
        <BulkImageUpdateModal
          title="Edit Staff Images"
          entityLabel="staff"
          records={selectedStaffImageRecords}
          onClose={() => setShowBulkImageModal(false)}
          onApply={handleBulkStaffImages}
          onRemove={handleRemoveBulkStaffImages}
        />
      )}

      {showImportModal && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in p-4"
          onClick={e => { if (e.target === e.currentTarget && !isImporting) closeImportModal(); }}
        >
          <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700 flex flex-col ${
            importStep === 'preview' ? 'max-w-6xl h-[92vh]' : 'max-w-md max-h-[85vh]'
          }`}>
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Staff</h2>
              </div>
              <button onClick={() => closeImportModal()} disabled={isImporting} className="p-1 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className={`flex-1 min-h-0 p-5 ${importStep === 'preview' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
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
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload Excel or CSV file</p>
                    <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-2 text-sm">Expected Fields:</h4>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {staffExpectedFields.map(field => (
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
                  {draftNotice && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
                      {draftNotice}
                    </div>
                  )}
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
                        {staffExpectedFields.map(field => (
                          <tr key={field.key}>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">{field.label}{field.required ? '*' : ''}</td>
                            <td className="px-2 py-1.5">
                              <select value={fieldMapping[field.key] || ''} onChange={(e) => updateKnownFieldMapping(field.key, e.target.value)} className="w-full form-input py-1 px-2 text-xs">
                                <option value="">-- Skip --</option>
                                {csvHeaders.map(header => (<option key={header} value={header}>{header}</option>))}
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
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Rename detected columns to save them as custom staff fields, or clear the name to skip.</p>
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
                    <button onClick={() => closeImportModal()} disabled={isImporting} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={previewStaffImportWithDelay} disabled={isPreviewingImport} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-70">
                      {isPreviewingImport ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                      {isPreviewingImport ? 'Loading preview...' : 'Preview'}
                    </button>
                  </div>
                </div>
              )}
              {importStep === 'preview' && (
                <div data-preview-fullscreen-root className="flex h-full min-h-0 flex-col gap-3 rounded-xl bg-white p-1 dark:bg-slate-800">
                  {draftNotice && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
                      {draftNotice}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="px-1.5 py-0.5 text-white rounded flex items-center gap-1" style={{ backgroundColor: 'var(--solid-emerald)' }}><Check size={10} /> 1</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 text-white rounded flex items-center gap-1" style={{ backgroundColor: 'var(--solid-emerald)' }}><Check size={10} /> 2</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3</span>
                    </div>
                    <FullscreenButton />
                  </div>
                  <div className="highlight-label-emerald rounded-lg p-2.5">
                    <p className="text-sm"><strong>{importPreview.length}</strong> staff ready to import</p>
                    <p className="mt-1 text-xs opacity-90">
                      <strong>{selectedImportCount}</strong> selected
                      {selectedNewActiveImportCount > 0 ? `, ${selectedNewActiveImportCount} new active staff` : ''}
                    </p>
                    {importPlanCapacity && (
                      <p className="mt-1 text-xs opacity-90">
                        Current plan: <strong>{importPlanCapacity.planName}</strong>. Available now: <strong>{availableStaffImportCount}</strong> selected record{availableStaffImportCount === 1 ? '' : 's'}
                        {availableNewActiveImportCount > 0 ? `, including ${availableNewActiveImportCount} new active staff` : ''}.
                        {' '}New active slots left before import: <strong>{remainingStaffSlots}</strong>.
                      </p>
                    )}
                  </div>
                  {staffLimitNotice && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                      {staffLimitNotice}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/40">
                    <button
                      type="button"
                      onClick={() => setAllImportRowsSelected(!allImportRowsSelected)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                      disabled={isImporting}
                    >
                      {allImportRowsSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                      {allImportRowsSelected ? 'Clear all' : 'Select all'}
                    </button>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Choose exactly what to import, or use available slots only.
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="h-full overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Select</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Role</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Extra</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.map((staffMember, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => toggleImportRow(index)}
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-md border transition ${
                                  selectedImportRows.has(index)
                                    ? 'border-indigo-500 bg-indigo-600 text-white'
                                    : 'border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800'
                                }`}
                                disabled={isImporting}
                                title={selectedImportRows.has(index) ? 'Selected' : 'Not selected'}
                              >
                                {selectedImportRows.has(index) ? <CheckSquare size={14} /> : <Square size={14} />}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{(staffMember as any).firstName} {(staffMember as any).lastName}</td>
                            <td className="px-2 py-1.5">{(staffMember as any).role || '-'}</td>
                            <td className="px-2 py-1.5">
                              {Array.isArray((staffMember as any).customFields) && (staffMember as any).customFields.length > 0
                                ? `${(staffMember as any).customFields.length} custom`
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-between pt-2">
                    <div className="flex-1 max-w-40">
                      {isImporting && (
                        <>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full transition-all" style={{ width: `${importProgress}%`, backgroundColor: 'var(--solid-emerald)' }} />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{importProgress}% imported</p>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm" disabled={isImporting}>Back</button>
                      {staffLimitNotice && (
                        <button onClick={proceedWithAvailableStaffImport} disabled={isImporting || availableStaffImportCount === 0} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60">
                          Import available for plan ({availableStaffImportCount})
                          {skippedStaffImportCount > 0 ? `, skip ${skippedStaffImportCount}` : ''}
                        </button>
                      )}
                      <button onClick={() => executeImport()} disabled={isImporting || selectedImportCount === 0} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-70">
                        {isImporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                        {isImporting ? 'Importing...' : `Import selected (${selectedImportCount})`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Generate Payroll Modal */}
      {showPayrollModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-white" />
                <h2 className="font-bold text-white">Generate Payroll</h2>
              </div>
              <button onClick={() => setShowPayrollModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="form-label">Select Month & Year</label>
                <input
                  type="month"
                  value={payrollMonth}
                  onChange={(e) => setPayrollMonth(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  This will create payroll entries for all active staff members who have a salary set.
                  Staff without a salary will be skipped.
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>{staff.filter(s => s.status === 'active' && s.salary && s.salary > 0).length}</strong> staff members will be included.
                </p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => setShowPayrollModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleGeneratePayroll} className="btn btn-primary">
                Generate Payroll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Paid Modal */}
      <DropdownModal
        isOpen={showPayModal}
        onClose={() => { setShowPayModal(false); setSelectedPayment(null); setPaymentNotes(''); }}
        title="Record Payment"
        icon={<CheckCircle size={20} className="text-emerald-500" />}
      >
        {selectedPayment && (
          <div className="p-4 space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500">Staff Member</span>
                <span className="font-semibold text-slate-800 dark:text-white">{selectedPayment.staffName}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500">Amount</span>
                <span className="font-bold text-lg text-emerald-600">{formatMoney(selectedPayment.amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Period</span>
                <span className="text-slate-700 dark:text-slate-300">{getMonthName(selectedPayment.month)}</span>
              </div>
            </div>
            <div>
              <label className="form-label text-sm">Notes (optional)</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="form-input min-h-[80px]"
                placeholder="Payment notes..."
              />
            </div>
            <button
              onClick={() => handleMarkAsPaid(selectedPayment)}
              className="w-full btn btn-primary flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} />
              Confirm Payment
            </button>
          </div>
        )}
      </DropdownModal>

      {/* History Modal */}
      <DropdownModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Payment History"
        icon={<Clock size={20} className="text-violet-500" />}
        maxHeight="max-h-[70vh]"
      >
        <div className="p-2 space-y-2">
          {salaryPayments.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 font-medium">No payment records</p>
              <p className="text-sm text-slate-400 mt-1">Generate payroll to see payment history</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg mb-3">
                <span className="text-xs text-slate-500">Total: {salaryPayments.length} records</span>
                <div className="flex gap-4 text-xs">
                  <span className="text-amber-600">{payrollStats.pending.length} pending</span>
                  <span className="text-emerald-600">{payrollStats.paid.length} paid</span>
                </div>
              </div>
              {salaryPayments
                .sort((a, b) => {
                  if (a.year !== b.year) return b.year - a.year;
                  return parseInt(b.month) - parseInt(a.month);
                })
                .slice(0, 50)
                .map((payment) => (
                  <div 
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 hover:border-slate-200 dark:hover:border-slate-500 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 dark:text-white text-sm">{payment.staffName}</p>
                        <span className={`badge ${getStatusBadge(payment.status)} text-xs`}>
                          {payment.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500">
                          {getMonthName(payment.month)}
                        </span>
                        {payment.paidAt && (
                          <span className="text-xs text-slate-400">
                            Paid: {new Date(payment.paidAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {payment.notes && (
                        <p className="text-xs text-slate-400 mt-1 truncate max-w-[200px]">{payment.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-white">
                        {formatMoney(payment.amount)}
                      </span>
                      {payment.status === 'pending' && (
                        <>
                          <button
                            onClick={() => openPayModal(payment)}
                            className="p-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 rounded-lg transition-colors"
                            title="Mark as Paid"
                          >
                            <CheckCircle size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(payment.id)}
                            className="p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              {salaryPayments.length > 50 && (
                <p className="text-center text-xs text-slate-500 py-2">
                  Showing 50 of {salaryPayments.length} records
                </p>
              )}
            </>
          )}
        </div>
      </DropdownModal>
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
