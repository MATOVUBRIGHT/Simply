import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Eye, Users, Briefcase, Phone, Mail, Download, Upload, FileText, ChevronDown, X, ArrowRight, Check, Square, CheckSquare, UserX, DollarSign, Clock, CheckCircle, Settings } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { PaymentMethod, StaffRole } from '@schofy/shared';
import type { Staff, SalaryPayment } from '@schofy/shared';
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

export default function StaffPage() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { data: staffData, loading } = useTableData(sid, 'staff');
  const { data: salaryPaymentsData } = useTableData(sid, 'salaryPayments');

  const staff = useMemo(() =>
    [...staffData].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [staffData]
  ) as Staff[];
  const salaryPayments = salaryPaymentsData as SalaryPayment[];

  const [search, setSearch] = useState('');
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Staff>[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
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
    if (selectMode) {
      setSelectedStaff(prev => {
        const newSet = new Set(prev);
        if (newSet.has(staffId)) {
          newSet.delete(staffId);
        } else {
          newSet.add(staffId);
        }
        return newSet;
      });
    } else {
      setSelectMode(true);
      setSelectedStaff(new Set([staffId]));
    }
  }

  function handleRowDoubleClick(staffId: string) {
    navigate(`/staff/${staffId}`);
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
      
      for (const staffId of selectedStaff) {
        const staffMember = staff.find(s => s.id === staffId);
        if (staffMember) {
          await dataService.delete(id, 'staff', staffId);
          addToRecycleBin(id, {
            id: `staff-${Date.now()}-${Math.random()}`,
            type: 'staff',
            name: `${staffMember.firstName} ${staffMember.lastName}`,
            data: staffMember,
            deletedAt: now
          });
        }
      }
      
      
      setSelectedStaff(new Set());
      setSelectMode(false);
      addToast(`${selectedStaff.size} staff moved to recycle bin`, 'success');    } catch (error) {
      addToast('Failed to delete staff', 'error');
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

  const filteredStaff = staff.filter((s) =>
    s.firstName.toLowerCase().includes(search.toLowerCase()) ||
    s.lastName.toLowerCase().includes(search.toLowerCase()) ||
    s.employeeId.toLowerCase().includes(search.toLowerCase())
  );

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
    { key: 'employeeId', label: 'Employee ID', required: false },
    { key: 'firstName', label: 'First Name', required: true },
    { key: 'lastName', label: 'Last Name', required: true },
    { key: 'role', label: 'Role', required: false },
    { key: 'department', label: 'Department', required: false },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'address', label: 'Address', required: false },
  ];

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
    import('xlsx').then(({ utils, writeFile }) => {
      const headers = staffExpectedFields.map(f => f.label);
      const sampleRows = [
        ['EMP-001', 'John', 'Doe', 'teacher', 'Academic', '0771234567', 'john.doe@school.com', '123 Main Street'],
        ['EMP-002', 'Jane', 'Smith', 'admin', 'Administration', '0782345678', 'jane.smith@school.com', '45 Park Avenue'],
        ['EMP-003', 'Peter', 'Okello', 'teacher', 'Sciences', '0753456789', '', ''],
      ];
      const ws = utils.aoa_to_sheet([
        ['// Role options: teacher, admin, principal, librarian, nurse, driver, cook, security, other'],
        headers,
        ...sampleRows,
      ]);
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Staff');
      writeFile(wb, 'staff-import-template.xlsx');
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

      // Smart auto-mapping: normalize by stripping spaces/underscores and camelCase
      const norm = (s: string) => s.toLowerCase().replace(/[\s_\-()\/]/g, '').replace(/[^a-z0-9]/g, '');
      const camelWords = (s: string) => s.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/[\s_\-]/g, '');
      const autoMapping: Record<string, string> = {};
      staffExpectedFields.forEach(field => {
        const nKey = norm(field.key);
        const nLabel = norm(field.label);
        const nCamel = camelWords(field.key);
        const matchingHeader = headers.find(h => {
          const nH = norm(h);
          return nH === nKey || nH === nLabel || nH === nCamel ||
            nH.includes(nKey) || nKey.includes(nH) ||
            nH.includes(nLabel) || nLabel.includes(nH);
        });
        if (matchingHeader) autoMapping[field.key] = matchingHeader;
      });
      setCsvHeaders(headers);
      setCsvData(data);
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) {
      addToast('Failed to read Excel file', 'error');
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

  function processMapping() {
    const mappedData: Partial<Staff>[] = [];
    for (const row of csvData) {
      const staffMember: Partial<Staff> = {};
      staffExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            (staffMember as any)[field.key] = row[headerIndex];
          }
        }
      });
      if (staffMember.firstName || staffMember.lastName || staffMember.employeeId) {
        mappedData.push(staffMember);
      }
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (!id || submittingRef.current) return;
    if (importPreview.length === 0) { addToast('No valid staff to import', 'error'); return; }
    submittingRef.current = true;
    setIsImporting(true);
    setImportProgress(0);
    try {
      const now = new Date().toISOString();
      let successCount = 0;
      // Close modal immediately — import runs in background
      const previewSnapshot = [...importPreview];
      closeImportModal();
      addToast(`Importing ${previewSnapshot.length} staff member${previewSnapshot.length !== 1 ? 's' : ''}... completing in background`, 'info');
      for (let i = 0; i < previewSnapshot.length; i++) {
        const data = previewSnapshot[i];
        const staffMember: Staff = {
          id: crypto.randomUUID(), schoolId: id,
          employeeId: (data.employeeId as string) || `EMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          firstName: (data.firstName as string) || 'Unknown',
          lastName: (data.lastName as string) || 'Unknown',
          role: (data.role as any) || 'teacher',
          department: data.department, phone: (data.phone as string) || '',
          email: data.email as string | undefined, address: data.address as string | undefined,
          status: 'active', createdAt: now, updatedAt: now,
        };
        const result = await dataService.create(id, 'staff', staffMember as any);
        if (!result.success) console.error('Import failed for', staffMember.firstName, result.error);
        else successCount++;
        setImportProgress(Math.round(((i + 1) / previewSnapshot.length) * 100));
      }
      addToast(`Imported ${successCount} staff member${successCount !== 1 ? 's' : ''}`, 'success');
    } catch (error) {
      addToast('Failed to import staff', 'error');
    } finally {
      submittingRef.current = false;
      setIsImporting(false);
      setImportProgress(0);
    }
  }

  const [showTeachersPanel, setShowTeachersPanel] = useState(false);
  const confirm = useConfirm();

  const teachersCount = staff.filter(s => s.role === 'teacher').length;
  const activeCount = staff.filter(s => s.status === 'active').length;

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
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx,.xls" className="hidden" />
          <Link to="/staff/new" className="btn btn-primary">
            <Plus size={16} />
            Add Staff
          </Link>
        </div>
      </div>

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

      {/* Teachers Panel - only shown when Teachers card is clicked */}
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
            {filteredStaff.filter(s => s.role === StaffRole.TEACHER).length === 0 ? (
              <div className="text-center py-8">
                <Briefcase size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 font-medium">No teachers found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredStaff.filter(s => s.role === StaffRole.TEACHER).map((teacher) => (
                  <div key={teacher.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${getAvatarColor(teacher.firstName)} flex items-center justify-center`}>
                        <span className="text-xs font-bold text-white">{teacher.firstName?.charAt(0)}{teacher.lastName?.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 dark:text-white text-sm">{teacher.firstName} {teacher.lastName}</p>
                        <p className="text-xs text-slate-500">{teacher.email || teacher.phone || 'No contact'}</p>
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
                <th>Contact</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={selectMode ? 8 : 7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm">Loading...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={selectMode ? 8 : 7} className="text-center py-12">
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
                filteredStaff.map((s, index) => (
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
                            onClick={() => setPreviewImage({ src: s.photoUrl!, alt: `${s.firstName} ${s.lastName}` })}
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
                    <td className="font-mono text-xs bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded">
                      {s.employeeId}
                    </td>
                    <td>
                      <span className="badge badge-violet capitalize">{s.role}</span>
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
                      <div className="flex items-center gap-1">
                        <Link to={`/staff/${s.id}`} className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg transition-colors">
                          <Eye size={15} />
                        </Link>
                        <Link to={`/staff/${s.id}/edit`} className="p-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-lg transition-colors">
                          <Edit size={15} />
                        </Link>
                        {s.email && (
                          <button 
                            onClick={() => window.open(`mailto:${s.email}`, '_blank')}
                            className="p-1.5 hover:bg-sky-100 dark:hover:bg-sky-900/30 text-sky-500 dark:text-sky-400 rounded-lg transition-colors"
                            title="Send Email"
                          >
                            <Mail size={15} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(s.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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

      {showImportModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div className="modal-card w-full max-w-xl max-h-[85vh] overflow-hidden animate-modal-in">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Staff</h2>
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
                                <select value={currentMapping} onChange={e => { const nk = e.target.value; setFieldMapping(prev => { const next = { ...prev }; Object.keys(next).forEach(k => { if (next[k] === header) delete next[k]; }); if (nk) next[nk] = header; return next; }); }} className="w-full form-input py-1 px-2 text-xs">
                                  <option value="">- Skip -</option>
                                  {staffExpectedFields.map(f => (<option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>))}
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
                    <p className="text-sm text-emerald-700 dark:text-emerald-300"><strong>{importPreview.length}</strong> staff ready to import</p>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.slice(0, 5).map((staffMember, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{(staffMember as any).firstName} {(staffMember as any).lastName}</td>
                            <td className="px-2 py-1.5">{(staffMember as any).role || '-'}</td>
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
      , document.body)}

      {/* Generate Payroll Modal */}
      {showPayrollModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div className="modal-card w-full max-w-md max-h-[85vh] overflow-hidden animate-modal-in">
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
      , document.body)}

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
    </div>
  );
}
