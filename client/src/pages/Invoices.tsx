import { useDeferredValue, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, FileText, Download, Printer, CheckCircle, XCircle, Clock, DollarSign, Users, ChevronDown, Upload, X, ArrowRight, Check as CheckIcon, Search, Filter, Settings, Trash2, GraduationCap, Save, Percent, Award, Search as SearchIcon, UserPlus, CreditCard, Pencil } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { PaymentMethod, Fee, FeeStructure, FeeCategory } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { useCurrency } from '../hooks/useCurrency';
import { useThrottle } from '../hooks/useDebounce';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useActiveStudents, useStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { getFeeStructuresByClass, createFeeStructure, deleteFeeStructure, getCategoryLabel, getCategoryColor, generateInvoicesFromStructure, uniqueFeeStructures } from '../utils/feeStructures';
import { ClassOption } from '../utils/classroom';
import { matchesStudentSearch } from '../utils/studentSearch';
import { matchesTextSearch } from '../utils/searchMatch';
import { runTasksInPercentBatches, runTasksInThirtyPercentBatches } from '../utils/bulkDelete';
import { useConfirm } from '../components/ConfirmModal';
import InvoiceTemplate, { DEFAULT_INVOICE_LABELS, InvoiceLabels } from '../components/InvoiceTemplate';
import { FullscreenButton } from '../components/FullscreenButton';
import { FitStatValue } from '../components/FitStatValue';
import { shouldSaveOnEnter } from '../utils/keyboard';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { PortalSelect } from '../components/PortalSelect';
import { getBoardingStatus } from '../utils/studentBoarding';

const LARGE_TABLE_RENDER_LIMIT = 300;

interface Invoice {
  id: string;
  studentId: string;
  classId?: string;
  studentName: string;
  description: string;
  amount: number;
  paidAmount: number;
  status: 'paid' | 'partial' | 'pending' | 'overdue';
  term: string;
  year: string;
  dueDate: string;
  createdAt: string;
}

interface Bursary {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  isFull?: boolean;
  term: string;
  year: string;
  createdAt: string;
}

interface Discount {
  id: string;
  studentId?: string;
  studentName?: string;
  classId?: string;
  className?: string;
  amount: number;
  type: 'fixed' | 'percentage';
  term: string;
  year: string;
  createdAt: string;
}

function termRank(term: string) {
  const n = Number(String(term).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isBeforeTerm(fee: Pick<Fee, 'term' | 'year'>, term: string, year: string) {
  const feeYear = Number(fee.year || 0);
  const selectedYear = Number(year || 0);
  if (feeYear !== selectedYear) return feeYear < selectedYear;
  return termRank(fee.term) < termRank(term);
}

function normalizePaymentMethodValue(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return PaymentMethod.CASH;
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized === 'cash') return PaymentMethod.CASH;
  if (normalized === 'bank' || normalized === 'bank_transfer' || normalized === 'transfer') return PaymentMethod.BANK_TRANSFER;
  if (normalized === 'card' || normalized === 'credit_card' || normalized === 'debit_card') return PaymentMethod.CARD;
  if (normalized === 'other') return PaymentMethod.OTHER;
  return normalized || PaymentMethod.CASH;
}

function paymentMethodLabel(value: unknown) {
  const normalized = normalizePaymentMethodValue(value);
  if (normalized === PaymentMethod.CASH) return 'Cash';
  if (normalized === PaymentMethod.BANK_TRANSFER) return 'Bank Transfer';
  if (normalized === PaymentMethod.CARD) return 'Card';
  if (normalized === PaymentMethod.OTHER) return 'Other';
  return String(value || normalized)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default function Invoices() {
  const { user, schoolId } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bulkInvoiceTerm, setBulkInvoiceTerm] = useState('1');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTerm, setFilterTerm] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showTermFilter, setShowTermFilter] = useState(false);
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { formatMoney, currency } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const deepLinkedStudentRef = useRef(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const termFilterRef = useRef<HTMLDivElement>(null);
  const statusFilterButtonRef = useRef<HTMLButtonElement>(null);
  const termFilterButtonRef = useRef<HTMLButtonElement>(null);
  const [statusDropdownPos, setStatusDropdownPos] = useState({ top: 0, left: 0 });
  const [termDropdownPos, setTermDropdownPos] = useState({ top: 0, left: 0 });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [viewMode, setViewMode] = useState<'invoices' | 'students'>('invoices');
  const [managementPage, setManagementPage] = useState<'structures' | 'bursary' | 'discount' | null>(null);
  const [selectedStudentForView, setSelectedStudentForView] = useState<any | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState({ description: '', amount: '', status: 'pending', term: '', year: '', dueDate: '' });
  const [savingInvoiceEdit, setSavingInvoiceEdit] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterStructure, setFilterStructure] = useState<string>('all');
  
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('1');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>([]);
  const [showAddStructureForm, setShowAddStructureForm] = useState(false);
  const [newStructure, setNewStructure] = useState<{ name: string; category: FeeCategory; amount: number; isRequired: boolean; description: string }>({ name: '', category: FeeCategory.TUITION, amount: 0, isRequired: true, description: '' });
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [showBursaryModal, setShowBursaryModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [bursaries, setBursaries] = useState<Bursary[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [newBursary, setNewBursary] = useState({ amount: 0, isFull: false });
  const [selectedBursaryStudentIds, setSelectedBursaryStudentIds] = useState<string[]>([]);
  const [newDiscount, setNewDiscount] = useState({ amount: 0, type: 'fixed' as 'fixed' | 'percentage' });
  const [selectedDiscountStudentIds, setSelectedDiscountStudentIds] = useState<string[]>([]);
  const [searchStudent, setSearchStudent] = useState('');
  const [filterBursaryClass, setFilterBursaryClass] = useState<string>('all');
  const [searchDiscountStudent, setSearchDiscountStudent] = useState('');
  const [filterDiscountClass, setFilterDiscountClass] = useState<string>('all');
  const [applyClassIds, setApplyClassIds] = useState<string[]>([]);
  const [termSettings, setTermSettings] = useState<Record<string, string>>({});
  const [showPromotionBanner, setShowPromotionBanner] = useState(false);
  const [expiredTerm, setExpiredTerm] = useState('');
  const [recordingPaymentId, setRecordingPaymentId] = useState<string | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<{ amount: string; method: string }>({ amount: '', method: PaymentMethod.CASH });
  const [showAccountsModal, setShowAccountsModal] = useState(false);
  const [isInvoiceTemplateEditing, setIsInvoiceTemplateEditing] = useState(false);
  const [invoiceTemplateLabels, setInvoiceTemplateLabels] = useState<InvoiceLabels>(DEFAULT_INVOICE_LABELS);
  const [accountDrafts, setAccountDrafts] = useState([
    { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: 'BANK TRANSFER' },
    { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: '' },
    { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: '' },
  ]);
  const [savingAccounts, setSavingAccounts] = useState(false);

  const students = useActiveStudents();
  const { students: allStudents } = useStudents();
  const sid = schoolId || user?.id || '';
  const { data: feesData, loading: feesLoading, refresh: refreshFees } = useTableData(sid, 'fees');
  const { data: paymentsData, loading: paymentsLoading, refresh: refreshPayments } = useTableData(sid, 'payments');
  const { data: settingsData } = useTableData(sid, 'settings');
  const { data: feeStructuresData } = useTableData(sid, 'feeStructures');
  const fees = feesData as any[];
  const payments = paymentsData as any[];
  const allFeeStructures = feeStructuresData as FeeStructure[];
  const classById = useMemo(() => new Map(classes.map(cls => [cls.id, cls])), [classes]);
  const feesByStudent = useMemo(() => {
    const map = new Map<string, any[]>();
    fees.forEach(fee => {
      if (!fee.studentId) return;
      const list = map.get(fee.studentId) || [];
      list.push(fee);
      map.set(fee.studentId, list);
    });
    return map;
  }, [fees]);
  const paymentsByFee = useMemo(() => {
    const map = new Map<string, any[]>();
    payments.forEach(payment => {
      if (!payment.feeId) return;
      const list = map.get(payment.feeId) || [];
      list.push(payment);
      map.set(payment.feeId, list);
    });
    return map;
  }, [payments]);
  const filteredBursaryStudents = useMemo(() => {
    return students.filter((student: any) => {
      if (filterBursaryClass !== 'all' && student.classId !== filterBursaryClass) return false;
      return matchesStudentSearch(student, searchStudent, [classById.get(student.classId)?.name || '']);
    });
  }, [students, filterBursaryClass, searchStudent, classById]);
  const filteredDiscountStudents = useMemo(() => {
    return students.filter((student: any) => {
      if (filterDiscountClass !== 'all' && student.classId !== filterDiscountClass) return false;
      return matchesStudentSearch(student, searchDiscountStudent, [classById.get(student.classId)?.name || '']);
    });
  }, [students, filterDiscountClass, searchDiscountStudent, classById]);
  const feeStructureGroups = useMemo(() => {
    const order = [
      FeeCategory.TUITION,
      FeeCategory.BOARDING,
      FeeCategory.EXAM,
      FeeCategory.REGISTRATION,
      FeeCategory.UNIFORM,
      FeeCategory.BOOKS,
      FeeCategory.TRANSPORT,
      FeeCategory.ACTIVITY,
      FeeCategory.OTHER,
    ];
    return order
      .map(category => ({
        category,
        items: feeStructures
          .filter(structure => structure.category === category)
          .sort((a, b) => Number(b.isRequired) - Number(a.isRequired) || a.name.localeCompare(b.name)),
      }))
      .filter(group => group.items.length > 0);
  }, [feeStructures]);

  // Derive bank accounts from settings for invoice display
  const bankAccounts = useMemo(() => {
    const obj: Record<string, string> = {};
    (settingsData as any[]).forEach((s: any) => { obj[s.key] = s.value; });
    try {
      const saved = obj.paymentAccountsJson ? JSON.parse(obj.paymentAccountsJson) : null;
      if (Array.isArray(saved)) {
        return saved
          .filter((account: any) => !account.hidden)
          .map((account: any) => ({
            accountName: account.accountName || '',
            accountNumber: account.accountNumber || '',
            bankName: String(account.paymentMethod || '').toLowerCase().includes('mobile') ? '' : account.bankName || '',
            bankBranch: String(account.paymentMethod || '').toLowerCase().includes('mobile') || String(account.paymentMethod || '').toLowerCase().includes('cash') ? '' : account.bankBranch || '',
            paymentMethod: account.paymentMethod || '',
          }))
          .filter((account: any) => account.accountName || account.accountNumber || account.bankName || account.bankBranch || account.paymentMethod);
      }
    } catch {
      // Fall back to legacy account settings.
    }
    const accounts = [];
    for (const suffix of ['', '2', '3']) {
      if (obj[`paymentAccountHidden${suffix}`] === 'true') continue;
      const name = obj[`bankAccountName${suffix}`];
      const number = obj[`bankAccountNumber${suffix}`];
      const bank = obj[`bankName${suffix}`];
      const branch = obj[`bankBranch${suffix}`];
      const method = obj[`paymentMethod${suffix}`];
      const loweredMethod = String(method || '').toLowerCase();
      if (name || number || bank || branch || method) {
        accounts.push({
          accountName: name || '',
          accountNumber: number || '',
          bankName: loweredMethod.includes('mobile') ? '' : bank || '',
          bankBranch: loweredMethod.includes('mobile') || loweredMethod.includes('cash') ? '' : branch || '',
          paymentMethod: method || '',
        });
      }
    }
    return accounts;
  }, [settingsData]);
  const paymentMethodOptions = useMemo(() => {
    const options = new Map<string, string>();
    const addMethod = (value: unknown, label?: string) => {
      const normalized = normalizePaymentMethodValue(value);
      if (!normalized) return;
      options.set(normalized, label || paymentMethodLabel(value));
    };
    addMethod(PaymentMethod.CASH, 'Cash');
    bankAccounts.forEach(account => addMethod(account.paymentMethod));
    addMethod(PaymentMethod.BANK_TRANSFER, 'Bank Transfer');
    addMethod(PaymentMethod.CARD, 'Card');
    addMethod(PaymentMethod.OTHER, 'Other');
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [bankAccounts]);

  const schoolSettings = useMemo(() => {
    const obj: Record<string, string> = {};
    (settingsData as any[]).forEach((s: any) => { obj[s.key] = s.value; });
    return obj;
  }, [settingsData]);

  useEffect(() => {
    try {
      const saved = schoolSettings.invoiceTemplateLabels ? JSON.parse(schoolSettings.invoiceTemplateLabels) : {};
      setInvoiceTemplateLabels({ ...DEFAULT_INVOICE_LABELS, ...saved });
    } catch {
      setInvoiceTemplateLabels(DEFAULT_INVOICE_LABELS);
    }
  }, [schoolSettings.invoiceTemplateLabels]);

  async function updateInvoiceTemplateLabels(nextLabels: Partial<InvoiceLabels>) {
    if (Object.keys(nextLabels).length === 0) return;
    const authId = schoolId || user?.id;
    const merged = { ...invoiceTemplateLabels, ...nextLabels };
    setInvoiceTemplateLabels(merged);
    if (!authId) return;
    try {
      await dataService.saveSettings(authId, { invoiceTemplateLabels: JSON.stringify(merged) });
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'settings' } }));
    } catch {
      addToast('Failed to save invoice template', 'error');
    }
  }

  useEffect(() => {
    const next = ['', '2', '3'].map((suffix, index) => ({
      accountName: schoolSettings[`bankAccountName${suffix}`] || '',
      accountNumber: schoolSettings[`bankAccountNumber${suffix}`] || '',
      bankName: schoolSettings[`bankName${suffix}`] || '',
      bankBranch: schoolSettings[`bankBranch${suffix}`] || '',
      paymentMethod: schoolSettings[`paymentMethod${suffix}`] || (index === 0 ? 'BANK TRANSFER' : ''),
    }));
    setAccountDrafts(next);
  }, [schoolSettings]);

  async function savePaymentAccounts() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    setSavingAccounts(true);
    try {
      const payload: Record<string, string> = {};
      const cleanedAccounts = accountDrafts.map(account => {
        const method = account.paymentMethod.trim();
        const loweredMethod = method.toLowerCase();
        return {
          accountName: account.accountName.trim(),
          accountNumber: loweredMethod.includes('cash') ? '' : account.accountNumber.trim(),
          bankName: loweredMethod.includes('mobile') ? '' : account.bankName.trim(),
          bankBranch: loweredMethod.includes('mobile') || loweredMethod.includes('cash') ? '' : account.bankBranch.trim(),
          paymentMethod: method,
        };
      });
      payload.paymentAccountsJson = JSON.stringify(cleanedAccounts);
      ['', '2', '3'].forEach((suffix, index) => {
        const account = cleanedAccounts[index] || { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: '' };
        payload[`bankAccountName${suffix}`] = account.accountName.trim();
        payload[`bankAccountNumber${suffix}`] = account.accountNumber.trim();
        payload[`bankName${suffix}`] = account.bankName.trim();
        payload[`bankBranch${suffix}`] = account.bankBranch.trim();
        payload[`paymentMethod${suffix}`] = account.paymentMethod.trim();
      });
      await dataService.saveSettings(authId, payload);
      addToast('Payment accounts saved', 'success');
      setShowAccountsModal(false);
    } catch {
      addToast('Failed to save payment accounts', 'error');
    } finally {
      setSavingAccounts(false);
    }
  }

  function refreshInvoices() {
    refreshFees();
    refreshPayments();
  }

  function openEditInvoice(invoice: Invoice) {
    setEditingInvoice(invoice);
    setInvoiceDraft({
      description: invoice.description || '',
      amount: String(invoice.amount || ''),
      status: invoice.status || 'pending',
      term: String(invoice.term || selectedTerm),
      year: String(invoice.year || selectedYear),
      dueDate: invoice.dueDate || '',
    });
  }

  async function handleSaveInvoiceEdit() {
    const id = schoolId || user?.id;
    if (!id || !editingInvoice || savingInvoiceEdit) return;
    const amount = Number(invoiceDraft.amount);
    if (!invoiceDraft.description.trim() || !Number.isFinite(amount) || amount < 0) {
      addToast('Enter a valid description and amount', 'error');
      return;
    }
    setSavingInvoiceEdit(true);
    try {
      const existingFee = fees.find(fee => fee.id === editingInvoice.id);
      const nextStatus = invoiceDraft.status as Invoice['status'];
      await dataService.update(id, 'fees', editingInvoice.id, {
        ...(existingFee || {}),
        description: invoiceDraft.description.trim(),
        amount,
        status: nextStatus,
        term: invoiceDraft.term || selectedTerm,
        year: invoiceDraft.year || selectedYear,
        dueDate: invoiceDraft.dueDate || existingFee?.dueDate || editingInvoice.dueDate,
        updatedAt: new Date().toISOString(),
      } as any);
      if (nextStatus === 'paid' && editingInvoice.paidAmount < amount) {
        await dataService.create(id, 'payments', {
          id: uuidv4(),
          feeId: editingInvoice.id,
          studentId: editingInvoice.studentId,
          amount: amount - editingInvoice.paidAmount,
          method: PaymentMethod.CASH,
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        } as any);
      }
      setEditingInvoice(null);
      addToast('Invoice updated', 'success');
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: nextStatus === 'paid' ? 'payments' : 'fees' } }));
    } catch {
      addToast('Failed to update invoice', 'error');
    } finally {
      setSavingInvoiceEdit(false);
    }
  }

  async function handleDeleteInvoice(invoice: Invoice) {
    const id = schoolId || user?.id;
    if (!id || deletingInvoiceId) return;
    const ok = await confirm({
      title: 'Delete Invoice',
      description: `Delete "${invoice.description}" for ${invoice.studentName}? Payments linked to this fee will remain in records.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingInvoiceId(invoice.id);
    try {
      await dataService.delete(id, 'fees', invoice.id);
      setSelectedInvoiceIds(prev => prev.filter(selectedId => selectedId !== invoice.id));
      addToast('Invoice deleted', 'success');
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'fees' } }));
    } catch {
      addToast('Failed to delete invoice', 'error');
    } finally {
      setDeletingInvoiceId(null);
    }
  }

  function toggleInvoiceSelection(invoiceId: string) {
    setSelectedInvoiceIds(prev => (
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    ));
  }

  async function handleDeleteSelectedInvoices() {
    const id = schoolId || user?.id;
    if (!id || selectedInvoiceIds.length === 0 || deletingInvoiceId) return;
    const selectedSet = new Set(selectedInvoiceIds);
    const selectedInvoices = invoices.filter(invoice => selectedSet.has(invoice.id));
    const ok = await confirm({
      title: 'Delete Selected Invoices',
      description: `Delete ${selectedInvoices.length} selected invoice${selectedInvoices.length === 1 ? '' : 's'}? Payments linked to these fees will remain in records.`,
      confirmLabel: 'Delete selected',
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingInvoiceId('bulk');
    try {
      const tasks = selectedInvoices.map(invoice => async () => {
        await dataService.delete(id, 'fees', invoice.id);
      });
      await runTasksInPercentBatches(tasks, 0.5);
      setSelectedInvoiceIds([]);
      addToast(`Deleted ${selectedInvoices.length} invoice${selectedInvoices.length === 1 ? '' : 's'}`, 'success');
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'fees' } }));
    } catch {
      addToast('Failed to delete selected invoices', 'error');
    } finally {
      setDeletingInvoiceId(null);
    }
  }
  const activeInvoiceTerm = filterTerm !== 'all' ? filterTerm : selectedTerm;
  const activeInvoiceYear = selectedYear;
  const studentInvoiceSummary = useMemo(() => {
    if (!allStudents || !fees || !payments) return [];
    
    return allStudents.map(student => {
      const studentFees = feesByStudent.get(student.id) || [];
      const previousFees = studentFees.filter(f => isBeforeTerm(f, activeInvoiceTerm, activeInvoiceYear));
      const currentFees = studentFees.filter(f => String(f.term) === String(activeInvoiceTerm) && String(f.year) === String(activeInvoiceYear));
      const openingInvoiced = previousFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const openingPaid = previousFees
        .flatMap(f => paymentsByFee.get(f.id) || [])
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const openingBalance = Math.max(0, openingInvoiced - openingPaid);
      const totalInvoiced = currentFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const currentTermTotal = openingBalance + totalInvoiced;
      const totalPaid = currentFees.reduce((sum, f) => {
        const feePayments = paymentsByFee.get(f.id) || [];
        return sum + feePayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      }, 0);
      const balance = Math.max(0, openingBalance + totalInvoiced - totalPaid);
      const isInvoiced = currentFees.length > 0;
      const status = !isInvoiced && openingBalance > 0 ? 'last_term_balance' : !isInvoiced ? 'not_invoiced' : balance <= 0 ? 'paid' : 'pending';
      
      return {
        id: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        classId: student.classId,
        openingBalance,
        totalInvoiced,
        currentTermTotal,
        totalPaid,
        balance,
        invoiceCount: currentFees.length,
        isInvoiced,
        status,
      };
    });
  }, [allStudents, feesByStudent, paymentsByFee, activeInvoiceTerm, activeInvoiceYear]);

  useEffect(() => {
    if (deepLinkedStudentRef.current || studentInvoiceSummary.length === 0) return;
    const studentId = new URLSearchParams(window.location.search).get('student');
    if (!studentId) return;
    const summary = studentInvoiceSummary.find((row: any) => row.id === studentId);
    if (!summary) return;
    deepLinkedStudentRef.current = true;
    setViewMode('students');
    setSelectedStudentForView(summary);
  }, [studentInvoiceSummary]);

  const filteredStudentSummary = useMemo(() => studentInvoiceSummary.filter(s => {
    if (!matchesTextSearch([s.studentName, s.admissionNo], deferredSearchTerm)) return false;
    if (filterStatus === 'invoiced' && !s.isInvoiced) return false;
    if (filterStatus === 'not_invoiced' && s.isInvoiced) return false;
    if (filterStatus === 'paid' && s.status !== 'paid') return false;
    if (filterStatus === 'pending' && s.balance <= 0) return false;
    return true;
  }), [studentInvoiceSummary, deferredSearchTerm, filterStatus]);

  // Realtime: fee structures reload when class selection changes
  useEffect(() => {
    const reloadStructures = () => { if (selectedClassId) loadFeeStructures(); };
    window.addEventListener('feeStructuresUpdated', reloadStructures);
    window.addEventListener('feeStructuresDataChanged', reloadStructures);
    return () => {
      window.removeEventListener('feeStructuresUpdated', reloadStructures);
      window.removeEventListener('feeStructuresDataChanged', reloadStructures);
    };
  }, [selectedClassId]);

  const invoices = useMemo(() => {
    if (!fees || !payments || !allStudents) return [];
    
    const invoiceMap = new Map<string, Invoice>();
    
    fees.forEach(fee => {
      const student = allStudents.find(s => s.id === fee.studentId);
      const studentPayments = payments.filter(p => p.feeId === fee.id);
      const paidAmount = studentPayments.reduce((sum, p) => sum + p.amount, 0);
      const paymentStatus: Invoice['status'] = paidAmount >= fee.amount ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';
      const manualStatus = ['paid', 'partial', 'pending', 'overdue'].includes(String(fee.status)) ? fee.status as Invoice['status'] : '';
      const status: Invoice['status'] = paymentStatus === 'paid' ? 'paid' : manualStatus || paymentStatus;
      
      invoiceMap.set(fee.id, {
        id: fee.id,
        studentId: fee.studentId || '',
        classId: fee.classId || student?.classId || '',
        studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
        description: fee.description,
        amount: fee.amount,
        paidAmount,
        status,
        term: fee.term,
        year: fee.year,
        dueDate: fee.dueDate || '',
        createdAt: fee.createdAt,
      });
    });

    return Array.from(invoiceMap.values());
  }, [fees, payments, allStudents]);

  const invoiceExpectedFields = [
    { key: 'studentName', label: 'Student Name', required: true },
    { key: 'description', label: 'Description', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'term', label: 'Term', required: false },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (statusFilterRef.current && !statusFilterRef.current.contains(event.target as Node)) {
        setShowStatusFilter(false);
      }
      if (termFilterRef.current && !termFilterRef.current.contains(event.target as Node)) {
        setShowTermFilter(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDropdownPosition = (button: HTMLButtonElement | null) => {
    if (!button) return { top: 0, left: 0 };
    const rect = button.getBoundingClientRect();
    const width = 224;
    return {
      top: rect.bottom + 8,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
    };
  };

  const updateDropdownPositions = useCallback(() => {
    if (showStatusFilter) setStatusDropdownPos(getDropdownPosition(statusFilterButtonRef.current));
    if (showTermFilter) setTermDropdownPos(getDropdownPosition(termFilterButtonRef.current));
  }, [showStatusFilter, showTermFilter]);
  const throttledDropdownPositionUpdate = useThrottle(updateDropdownPositions, 50, [updateDropdownPositions]);

  useEffect(() => {
    updateDropdownPositions();
    if (!showStatusFilter && !showTermFilter) return;
    window.addEventListener('scroll', throttledDropdownPositionUpdate, true);
    window.addEventListener('resize', throttledDropdownPositionUpdate);
    return () => {
      window.removeEventListener('scroll', throttledDropdownPositionUpdate, true);
      window.removeEventListener('resize', throttledDropdownPositionUpdate);
    };
  }, [showStatusFilter, showTermFilter, updateDropdownPositions, throttledDropdownPositionUpdate]);

  useEffect(() => {
    if (user?.id || schoolId) {
      loadClasses();
      loadBursariesAndDiscounts();
      loadTermSettings();
    }
  }, [user, schoolId]);

  useEffect(() => {
    if (selectedClassId && user?.id) {
      loadFeeStructures();
    }
  }, [selectedClassId, selectedTerm, selectedYear, user]);

  async function loadBursariesAndDiscounts() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const [bursaryData, discountData] = await Promise.all([
        dataService.getAll(id, 'bursaries'),
        dataService.getAll(id, 'discounts'),
      ]);
      setBursaries(bursaryData);
      setDiscounts(discountData);
    } catch (error) {
      console.error('Failed to load bursaries and discounts:', error);
    }
  }

  async function loadTermSettings() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const stored = await dataService.getAll(id, 'settings');
      const obj: Record<string, string> = {};
      stored.forEach((s: any) => { obj[s.key] = s.value; });
      setTermSettings(obj);
      // Check if current term has ended → prompt class promotion
      const currentTerm = obj.currentTerm || '1';
      const endKey = `term${currentTerm}End`;
      const endDate = obj[endKey];
      if (endDate && new Date(endDate) < new Date()) {
        setExpiredTerm(currentTerm);
        setShowPromotionBanner(true);
      }
    } catch {}
  }

  async function loadClasses() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const { getStudentClassOptions } = await import('../utils/classroom');
      const options = await getStudentClassOptions(id);
      setClasses(options);
      if (options.length > 0 && !selectedClassId) {
        setSelectedClassId(options[0].id);
      }
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  }

  async function loadFeeStructures() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const structures = await getFeeStructuresByClass(id, selectedClassId, selectedTerm, selectedYear);
      const unique = uniqueFeeStructures(structures);
      setFeeStructures(unique);
      setSelectedStructureIds(Array.from(new Set(unique.filter(s => s.isRequired).map(s => s.id))));
    } catch (error) {
      console.error('Failed to load fee structures:', error);
    }
  }

  const [savingStructure, setSavingStructure] = useState(false);
  const [applyingStructures, setApplyingStructures] = useState(false);
  const [deletingStructureId, setDeletingStructureId] = useState<string | null>(null);
  const [savingBursary, setSavingBursary] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [deletingBursaryId, setDeletingBursaryId] = useState<string | null>(null);
  const [deletingDiscountId, setDeletingDiscountId] = useState<string | null>(null);

  const pageSelectClass = 'form-input form-select relative z-[70] min-w-0';

  async function handleCreateStructure() {
    const id = schoolId || user?.id;
    if (!newStructure.name || newStructure.amount <= 0 || !id) {
      addToast('Please enter a name and amount', 'error');
      return;
    }
    if (savingStructure) return;
    setSavingStructure(true);
    try {
      const structure = await createFeeStructure(
        id,
        selectedClassId,
        newStructure.name,
        newStructure.category,
        newStructure.amount,
        selectedTerm,
        selectedYear,
        newStructure.isRequired,
        newStructure.description
      );
      setFeeStructures(prev => uniqueFeeStructures([...prev.filter(item => item.id !== structure.id), structure]));
      if (structure.isRequired) {
        setSelectedStructureIds(prev => Array.from(new Set([...prev, structure.id])));
      }
      setNewStructure({ name: '', category: FeeCategory.TUITION, amount: 0, isRequired: true, description: '' });
      setShowAddStructureForm(false);
      addToast('Fee structure saved', 'success');
    } catch (error: any) {
      if (error?.message === 'DUPLICATE_FEE_STRUCTURE') {
        addToast('A fee with this name already exists for this class/term/year', 'error');
      } else {
        addToast(error?.message || 'Failed to save fee structure', 'error');
      }
    } finally {
      setSavingStructure(false);
    }
  }

  async function handleDeleteStructure(idStructure: string) {
    const id = schoolId || user?.id;
    if (!id || deletingStructureId) return;
    const structure = feeStructures.find(item => item.id === idStructure) || allFeeStructures.find(item => item.id === idStructure);
    setDeletingStructureId(idStructure);
    try {
      let deletedInvoices = 0;
      if (structure) {
        const structureName = String(structure.name || structure.description || 'Fee').trim().toLowerCase();
        const relatedFees = fees.filter((fee: any) => {
          const feeDescription = String(fee.description || '').trim().toLowerCase();
          return String(fee.classId || '') === String(structure.classId || selectedClassId || '') &&
            String(fee.term || '') === String(structure.term || selectedTerm || '') &&
            String(fee.year || '') === String(structure.year || selectedYear || '') &&
            Math.abs(Number(fee.amount || 0) - Number(structure.amount || 0)) < 0.01 &&
            (feeDescription === structureName || feeDescription.startsWith(`${structureName} (`));
        });
        const relatedFeeIds = relatedFees.map((fee: any) => fee.id);
        const relatedPayments = payments.filter((payment: any) => relatedFeeIds.includes(payment.feeId));
        await Promise.all([
          ...relatedPayments.map((payment: any) => dataService.delete(id, 'payments', payment.id)),
          ...relatedFees.map((fee: any) => dataService.delete(id, 'fees', fee.id)),
        ]);
        deletedInvoices = relatedFees.length;
      }
      await deleteFeeStructure(id, idStructure);
      setFeeStructures(prev => prev.filter(s => s.id !== idStructure));
      setSelectedStructureIds(prev => prev.filter(sid => sid !== idStructure));
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'fees' } }));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'payments' } }));
      addToast(deletedInvoices > 0 ? `Fee structure deleted with ${deletedInvoices} generated invoice${deletedInvoices === 1 ? '' : 's'}` : 'Fee structure deleted', 'success');
    } catch (error) {
      addToast('Failed to delete fee structure', 'error');
    } finally {
      setDeletingStructureId(null);
    }
  }

  async function handleApplyStructuresToClasses() {
    const id = schoolId || user?.id;
    if (!id || applyingStructures) return;
    if (selectedStructureIds.length === 0) {
      addToast('Select fees or requirements to apply', 'error');
      return;
    }
    if (applyClassIds.length === 0) {
      addToast('Select at least one class', 'error');
      return;
    }

    setApplyingStructures(true);
    try {
      const existing = await dataService.getAll(id, 'feeStructures');
      const selected = feeStructures.filter(structure => selectedStructureIds.includes(structure.id));
      let createdCount = 0;

      for (const targetClassId of applyClassIds) {
        for (const structure of selected) {
          const duplicate = existing.find((item: any) =>
            item.classId === targetClassId &&
            item.name?.toLowerCase() === structure.name?.toLowerCase() &&
            item.category === structure.category &&
            item.term === selectedTerm &&
            String(item.year) === String(selectedYear)
          );
          if (duplicate) continue;

          const copy: FeeStructure = {
            ...structure,
            id: uuidv4(),
            classId: targetClassId,
            term: selectedTerm,
            year: parseInt(selectedYear) as any,
            createdAt: new Date().toISOString(),
            updatedAt: undefined,
          };
          await dataService.create(id, 'feeStructures', copy as any);
          existing.push(copy as any);
          createdCount++;
        }
      }

      setApplyClassIds([]);
      addToast(createdCount > 0 ? `Applied ${createdCount} fees/requirements to selected classes` : 'Selected classes already have these fees/requirements', createdCount > 0 ? 'success' : 'info');
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'feeStructures' } }));
    } catch (error) {
      console.error('Failed to apply fee structures:', error);
      addToast('Failed to apply fees/requirements', 'error');
    } finally {
      setApplyingStructures(false);
    }
  }

  async function handleAddBursary() {
    const id = schoolId || user?.id;
    if (!id || savingBursary) return;
    if (selectedBursaryStudentIds.length === 0 || (!newBursary.isFull && newBursary.amount <= 0)) {
      addToast('Select students and enter a bursary amount', 'error');
      return;
    }

    setSavingBursary(true);
    try {
      const selectedIds = Array.from(new Set(selectedBursaryStudentIds));
      const existingKeys = new Set(
        bursaries
          .filter(b => String(b.term) === String(selectedTerm) && String(b.year) === String(selectedYear))
          .map(b => b.studentId)
      );
      const created: Bursary[] = [];

      for (const studentId of selectedIds) {
        if (existingKeys.has(studentId)) continue;
        const student = students.find(s => s.id === studentId);
        if (!student) continue;
        const bursary: Bursary = {
          id: uuidv4(),
          studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          amount: newBursary.isFull ? 0 : newBursary.amount,
          isFull: newBursary.isFull,
          term: selectedTerm,
          year: selectedYear,
          createdAt: new Date().toISOString()
        };
        await dataService.create(id, 'bursaries', bursary as any);
        existingKeys.add(studentId);
        created.push(bursary);
      }

      setBursaries(prev => [...prev, ...created]);
      setSelectedBursaryStudentIds([]);
      setNewBursary({ amount: 0, isFull: false });
      addToast(created.length > 0 ? `Bursary added for ${created.length} student${created.length !== 1 ? 's' : ''}` : 'Selected students already have bursary records for this term', created.length > 0 ? 'success' : 'info');
    } catch (error) {
      addToast('Failed to add bursary', 'error');
    } finally {
      setSavingBursary(false);
    }
  }

  async function handleDeleteBursary(idBursary: string) {
    const id = schoolId || user?.id;
    if (!id || deletingBursaryId) return;
    setDeletingBursaryId(idBursary);
    try {
      await dataService.delete(id, 'bursaries', idBursary);
      setBursaries(prev => prev.filter(br => br.id !== idBursary));
      addToast('Bursary removed', 'success');
    } catch (error) {
      addToast('Failed to remove bursary', 'error');
    } finally {
      setDeletingBursaryId(null);
    }
  }

  async function handleAddDiscount() {
    const id = schoolId || user?.id;
    if (!id || savingDiscount) return;
    if (selectedDiscountStudentIds.length === 0 || newDiscount.amount <= 0) {
      addToast('Select students and enter a discount value', 'error');
      return;
    }
    if (newDiscount.type === 'percentage' && newDiscount.amount > 100) {
      addToast('Percentage discount cannot exceed 100%', 'error');
      return;
    }

    setSavingDiscount(true);
    try {
      const selectedIds = Array.from(new Set(selectedDiscountStudentIds));
      const existingKeys = new Set(
        discounts
          .filter(d => String(d.term) === String(selectedTerm) && String(d.year) === String(selectedYear))
          .map(d => d.studentId)
      );
      const created: Discount[] = [];

      for (const studentId of selectedIds) {
        if (existingKeys.has(studentId)) continue;
        const student = students.find(s => s.id === studentId);
        if (!student) continue;
        const discount: Discount = {
          id: uuidv4(),
          studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          classId: student.classId,
          className: classes.find(c => c.id === student.classId)?.name || 'No class',
          amount: newDiscount.amount,
          type: newDiscount.type,
          term: selectedTerm,
          year: selectedYear,
          createdAt: new Date().toISOString()
        };
        await dataService.create(id, 'discounts', discount as any);
        existingKeys.add(studentId);
        created.push(discount);
      }

      setDiscounts(prev => [...prev, ...created]);
      setSelectedDiscountStudentIds([]);
      setNewDiscount({ amount: 0, type: 'fixed' });
      addToast(created.length > 0 ? `Discount added for ${created.length} student${created.length !== 1 ? 's' : ''}` : 'Selected students already have discount records for this term', created.length > 0 ? 'success' : 'info');
    } catch (error) {
      addToast('Failed to add discount', 'error');
    } finally {
      setSavingDiscount(false);
    }
  }

  async function handleDeleteDiscount(idDiscount: string) {
    const id = schoolId || user?.id;
    if (!id || deletingDiscountId) return;
    setDeletingDiscountId(idDiscount);
    try {
      await dataService.delete(id, 'discounts', idDiscount);
      setDiscounts(prev => prev.filter(disc => disc.id !== idDiscount));
      addToast('Discount removed', 'success');
    } catch (error) {
      addToast('Failed to remove discount', 'error');
    } finally {
      setDeletingDiscountId(null);
    }
  }

  async function handleGenerateInvoices() {
    if (selectedStructureIds.length === 0) {
      addToast('Please select at least one fee structure', 'error');
      return;
    }
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const studentsInClass = students.filter(s => s.classId === selectedClassId && isUUID(s.id));
      const classBursaries = bursaries.filter(b => b.term === selectedTerm && String(b.year) === String(selectedYear));
      const termDiscounts = discounts.filter(d => d.term === selectedTerm && String(d.year) === String(selectedYear));
      const structuresToApply = feeStructures.filter(s => selectedStructureIds.includes(s.id));
      const baseTotal = structuresToApply.reduce((sum, s) => sum + s.amount, 0);
      const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + 3);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      const yearInt = parseInt(selectedYear);
      const classIdVal = isUUID(selectedClassId) ? selectedClassId : null;
      let invoiceCount = 0;
      const now = new Date().toISOString();

      const tasks = studentsInClass.map((student) => async () => {
        // Skip if student already has an invoice for this term/year
        const alreadyInvoiced = fees.some(
          f => f.studentId === student.id &&
               String(f.term) === String(selectedTerm) &&
               String(f.year) === String(yearInt)
        );
        if (alreadyInvoiced) return;

        const studentBursary = classBursaries.find(b => b.studentId === student.id);
        if (studentBursary) {
          await dataService.create(id, 'fees', {
            id: uuidv4(), studentId: student.id, classId: classIdVal,
            description: studentBursary.isFull ? 'Full Bursary' : 'Bursary Invoice',
            amount: studentBursary.isFull ? 0 : studentBursary.amount,
            paidAmount: 0, dueDate: dueDateStr, term: selectedTerm,
            year: yearInt, status: 'pending', createdAt: now,
          } as any);
          invoiceCount++;
          return;
        }

        for (const structure of structuresToApply) {
          const discount = termDiscounts.find(d => d.studentId === student.id) || termDiscounts.find(d => !d.studentId && d.classId === selectedClassId);
          let invoiceAmount = structure.amount;
          let description = structure.name || structure.description || 'Fee';
          if (discount) {
            if (discount.type === 'percentage') {
              invoiceAmount = Math.max(0, invoiceAmount - (invoiceAmount * discount.amount) / 100);
              description += ` (${discount.amount}% off)`;
            } else {
              const share = baseTotal > 0 ? structure.amount / baseTotal : 0;
              invoiceAmount = Math.max(0, invoiceAmount - discount.amount * share);
            }
          }
          if (invoiceAmount <= 0) continue;
          await dataService.create(id, 'fees', {
            id: uuidv4(), studentId: student.id, classId: classIdVal,
            description, amount: invoiceAmount, paidAmount: 0,
            dueDate: dueDateStr, term: selectedTerm, year: yearInt,
            status: 'pending', createdAt: now,
          } as any);
          invoiceCount++;
        }
      });
      await runTasksInPercentBatches(tasks, 0.4);

      addToast(`Created ${invoiceCount} invoices for ${studentsInClass.length} students`, 'success');
      setShowCreateModal(false);
      setShowStructureModal(false);
      loadBursariesAndDiscounts();
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'fees' } }));
    } catch (error) {
      console.error('Failed to generate invoices:', error);
      addToast('Failed to generate invoices', 'error');
    }
  }

  async function handleBulkInvoiceWithData(description: string, amount: number, term: string) {
    // Redirect to fee structures instead of manual entry
    setShowCreateModal(false);
    setManagementPage('structures');
  }

  // Invoice a single student using their class fee structures
  async function handleInvoiceStudent(studentId: string, classId: string) {
    const id = schoolId || user?.id;
    if (!id || !classId) { addToast('Student has no class assigned', 'error'); return; }
    const structures = await getFeeStructuresByClass(id, classId, selectedTerm, selectedYear);
    if (structures.length === 0) {
      // No fee structures yet, so take the user to the fee structures page for this class.
      setSelectedClassId(classId);
      setManagementPage('structures');
      addToast('No fee structures found. Please set up fees for this class first.', 'info');
      return;
    }
    try {
      // Check if student already has an invoice for this term/year
      const alreadyInvoiced = fees.some(
        f => f.studentId === studentId &&
             String(f.term) === String(selectedTerm) &&
             String(f.year) === String(selectedYear)
      );
      if (alreadyInvoiced) {
        addToast('Student already has an invoice for this term', 'warning');
        return;
      }

      const [allBursaries, allDiscounts] = await Promise.all([
        dataService.getAll(id, 'bursaries'),
        dataService.getAll(id, 'discounts'),
      ]);
      const bursary = allBursaries.find((b: any) => b.studentId === studentId && b.term === selectedTerm && b.year === selectedYear);
      const discount = allDiscounts.find((d: any) => d.studentId === studentId && d.term === selectedTerm && String(d.year) === String(selectedYear)) ||
        allDiscounts.find((d: any) => !d.studentId && d.classId === classId && d.term === selectedTerm && String(d.year) === String(selectedYear));
      const applicable = structures.filter(s => s.isRequired || s.category === 'tuition' || s.category === 'boarding');
      const baseTotal = applicable.reduce((sum, s) => sum + s.amount, 0);
      const now = new Date().toISOString();
      if (bursary) {
        await dataService.create(id, 'fees', { id: uuidv4(), studentId, classId, description: bursary.isFull ? 'Full Bursary' : 'Bursary Invoice', amount: bursary.isFull ? 0 : bursary.amount, term: selectedTerm, year: selectedYear, createdAt: now } as any);
      } else {
        for (const structure of applicable) {
          let amount = structure.amount;
          let description = structure.name;
          if (discount) {
            if (discount.type === 'percentage') { amount = Math.max(0, amount - (amount * discount.amount) / 100); description += ` (${discount.amount}% off)`; }
            else { const share = baseTotal > 0 ? structure.amount / baseTotal : 0; amount = Math.max(0, amount - discount.amount * share); }
          }
          if (amount > 0) await dataService.create(id, 'fees', { id: uuidv4(), studentId, classId, description, amount, term: selectedTerm, year: selectedYear, createdAt: now } as any);
        }
      }
      addToast('Student invoiced successfully', 'success');
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'fees' } }));
    } catch { addToast('Failed to invoice student', 'error'); }
  }

  // Bulk invoice all classes that have fee structures
  async function handleBulkInvoiceAllClasses() {
    const id = schoolId || user?.id;
    if (!id) return;
    const submitting = (window as any).__bulkInvoicing;
    if (submitting) return;
    (window as any).__bulkInvoicing = true;
    try {
      let totalInvoiced = 0;
      let classesProcessed = 0;
      const tasks = classes.map((cls) => async () => {
        const { fees: created } = await generateInvoicesFromStructure(id, cls.id, selectedTerm, selectedYear);
        if (created.length > 0) { totalInvoiced += created.length; classesProcessed++; }
      });
      await runTasksInPercentBatches(tasks, 0.4);
      if (totalInvoiced === 0) {
        addToast('No fee structures found. Set up fee structures per class first.', 'info');
        setManagementPage('structures');
      } else {
        addToast(`Invoiced ${totalInvoiced} fees across ${classesProcessed} classes`, 'success');
        refreshInvoices();
      }
    } catch { addToast('Bulk invoice failed', 'error'); }
    finally { (window as any).__bulkInvoicing = false; }
  }

  function openPaymentModal(invoice: Invoice) {
    const remainingAmount = Math.max(0, invoice.amount - invoice.paidAmount);
    setPaymentInvoice(invoice);
    setPaymentDraft({ amount: String(remainingAmount), method: normalizePaymentMethodValue(PaymentMethod.CASH) });
  }

  async function saveInvoicePayment() {
    const id = schoolId || user?.id;
    if (!id || !paymentInvoice) return;
    if (recordingPaymentId) return;
    const amount = Number(paymentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('Enter a valid payment amount', 'error');
      return;
    }

    const method = normalizePaymentMethodValue(paymentDraft.method);
    const methodOption = paymentMethodOptions.find(option => option.value === method);
    setRecordingPaymentId(paymentInvoice.id);
    try {
      await dataService.create(id, 'payments', {
        id: uuidv4(),
        feeId: paymentInvoice.id,
        studentId: paymentInvoice.studentId,
        amount,
        method,
        methodLabel: methodOption?.label || paymentMethodLabel(method),
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as any);
      addToast('Payment recorded', 'success');
      setPaymentInvoice(null);
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'payments' } }));
    } catch (error) {
      addToast('Failed to record payment', 'error');
    } finally {
      setRecordingPaymentId(null);
    }
  }

  function handleExportCSV() {
    exportToCSV(invoices, 'invoices', [
      { key: 'studentName' as keyof Invoice, label: 'Student' },
      { key: 'description' as keyof Invoice, label: 'Description' },
      { key: 'amount' as keyof Invoice, label: 'Amount' },
      { key: 'paidAmount' as keyof Invoice, label: 'Paid' },
      { key: 'status' as keyof Invoice, label: 'Status' },
      { key: 'term' as keyof Invoice, label: 'Term' },
    ]);
    addToast('Exported to CSV', 'success');
    setShowExportMenu(false);
  }

  function handleExportPDF() {
    exportToPDF('Invoices Report', invoices, [
      { key: 'studentName', label: 'Student' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'paidAmount', label: 'Paid' },
      { key: 'status', label: 'Status' },
    ], 'invoices');
    addToast('Exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    exportToExcel(invoices, 'invoices', [
      { key: 'studentName' as keyof Invoice, label: 'Student' },
      { key: 'description' as keyof Invoice, label: 'Description' },
      { key: 'amount' as keyof Invoice, label: 'Amount' },
      { key: 'paidAmount' as keyof Invoice, label: 'Paid' },
      { key: 'status' as keyof Invoice, label: 'Status' },
      { key: 'term' as keyof Invoice, label: 'Term' },
    ]);
    addToast('Exported to Excel', 'success');
    setShowExportMenu(false);
  }

  function downloadTemplate() {
    const headers = invoiceExpectedFields.map(f => f.label);
    const sampleRows = [['John Doe', 'Term 1 Tuition', '50000', '1']];
    import('xlsx').then(({ utils, writeFile }) => {
      const ws = utils.aoa_to_sheet([headers, ...sampleRows]);
      ws['!cols'] = headers.map(() => ({ wch: 22 }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Invoices');
      writeFile(wb, 'invoices-import-template.xlsx');
      addToast('Excel template downloaded', 'success');
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
      let headers: string[] = [];
      let data: string[][] = [];
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const { read, utils } = await import('xlsx');
        const workbook = read(await file.arrayBuffer(), { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' })
          .filter(row => row.some(cell => String(cell ?? '').trim()));
        if (rows.length < 2) { addToast('Excel file must have headers and at least one data row', 'error'); return; }
        headers = rows[0].map(cell => String(cell ?? '').trim());
        data = rows.slice(1).map(row => headers.map((_, index) => String(row[index] ?? '').trim()));
      } else {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) { addToast('CSV must have headers and at least one data row', 'error'); return; }
        headers = parseCSVLine(lines[0]);
        data = lines.slice(1).map(line => parseCSVLine(line));
      }
      setCsvHeaders(headers);
      setCsvData(data);
      const autoMapping: Record<string, string> = {};
      invoiceExpectedFields.forEach(field => {
        const matchingHeader = headers.find(h => h.toLowerCase() === field.label.toLowerCase() || h.toLowerCase().includes(field.key.toLowerCase()));
        if (matchingHeader) autoMapping[field.key] = matchingHeader;
      });
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) { addToast('Failed to read import file', 'error'); }
    event.target.value = '';
  }

  function processMapping() {
    const mappedData: any[] = [];
    for (const row of csvData) {
      const record: any = {};
      invoiceExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            record[field.key] = row[headerIndex];
          }
        }
      });
      if (record.studentName && record.amount) mappedData.push(record);
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    if (importPreview.length === 0 || !user?.id) { addToast('No valid invoices to import', 'error'); return; }
    if (isImporting) return;
    setIsImporting(true);
    setImportProgress(0);
    try {
      const now = new Date().toISOString();
      const year = new Date().getFullYear().toString();
      let skippedCount = 0;
      const fees = importPreview.map((data) => {
        const student = students.find(s => matchesStudentSearch(s, data.studentName));
        if (!student) {
          skippedCount++;
          return null;
        }
        const id = schoolId || user?.id;
        if (!id) {
          skippedCount++;
          return null;
        }
        const fee: Fee = {
          id: uuidv4(),
          studentId: student.id,
          description: data.description,
          amount: parseFloat(data.amount),
          term: data.term || '1',
          year,
          createdAt: now,
        };
        return fee;
      }).filter(Boolean) as Fee[];
      setImportProgress(50);
      if (fees.length) await dataService.bulkCreate(schoolId || user.id, 'fees', fees as any[]);
      setImportProgress(100);
      const successCount = fees.length;
      addToast(`Successfully imported ${successCount} invoices${skippedCount ? `, ${skippedCount} skipped because no student matched` : ''}`, skippedCount ? 'warning' : 'success');
      closeImportModal();
      refreshInvoices();
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'fees' } }));
    } catch (error) { addToast('Failed to import invoices', 'error'); }
    finally { setIsImporting(false); }
  }

  const invoiceStructureOptions = useMemo(() => {
    const values = new Set<string>();
    invoices.forEach(invoice => {
      if (invoice.description) values.add(invoice.description);
    });
    allFeeStructures.forEach(structure => {
      if (structure.name) values.add(structure.name);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [invoices, allFeeStructures]);

  const filteredInvoices = useMemo(() => invoices.filter(inv => {
    if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
    if (filterTerm !== 'all' && inv.term !== filterTerm) return false;
    if (filterClassId !== 'all' && inv.classId !== filterClassId) return false;
    if (filterStructure !== 'all' && inv.description !== filterStructure) return false;
    if (deferredSearchTerm) {
      const className = classById.get(inv.classId || '')?.name || '';
      if (!matchesTextSearch([inv.studentName, inv.description, inv.status, inv.term, inv.year, className], deferredSearchTerm)) {
        return false;
      }
    }
    return true;
  }), [invoices, filterStatus, filterTerm, filterClassId, filterStructure, deferredSearchTerm, classById]);
  const visibleFilteredStudentSummary = filteredStudentSummary.slice(0, LARGE_TABLE_RENDER_LIMIT);
  const visibleFilteredInvoices = filteredInvoices.slice(0, LARGE_TABLE_RENDER_LIMIT);
  const listLoading = useMinimumLoading(feesLoading || paymentsLoading, 2000);

  const currentTermBursaries = useMemo(() => {
    return bursaries.filter(b => String(b.term) === String(selectedTerm) && String(b.year) === String(selectedYear));
  }, [bursaries, selectedTerm, selectedYear]);

  const currentTermDiscounts = useMemo(() => {
    return discounts.filter(d => String(d.term) === String(selectedTerm) && String(d.year) === String(selectedYear));
  }, [discounts, selectedTerm, selectedYear]);

  const stats = {
    total: filteredInvoices.reduce((sum, i) => sum + i.amount, 0),
    collected: filteredInvoices.reduce((sum, i) => sum + i.paidAmount, 0),
    pending: filteredInvoices.reduce((sum, i) => sum + (i.amount - i.paidAmount), 0),
    count: filteredInvoices.length,
    bursary: currentTermBursaries.reduce((sum, b) => sum + b.amount, 0),
    discount: currentTermDiscounts.reduce((sum, d) => d.type === 'percentage' ? sum : sum + d.amount, 0),
  };

  const statusConfig = {
    paid: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    partial: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    pending: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
    overdue: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  };

  return (
    <div className="space-y-6">
      {/* Term ended — class promotion banner */}
      {showPromotionBanner && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <GraduationCap size={20} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Term {expiredTerm} has ended</p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              The end date for Term {expiredTerm} has passed. Consider promoting students to their next class in the Students page.
            </p>
          </div>
          <button onClick={() => setShowPromotionBanner(false)} className="p-1 hover:bg-amber-100 dark:hover:bg-amber-800/40 rounded-lg transition-colors">
            <X size={16} className="text-amber-600 dark:text-amber-400" />
          </button>
        </div>
      )}
      {!managementPage && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                Student Invoices
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage and track all student invoices</p>
            </div>
            <div className="flex gap-2 flex-wrap">
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
                      <Printer size={14} />
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
              <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
                <Upload size={16} />
                <span className="hidden sm:inline">Import</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".csv,.xlsx,.xls"
                className="hidden"
              />
              <button onClick={() => { setManagementPage('structures'); setShowStructureModal(false); }} className="btn btn-secondary">
                <Settings size={16} />
                <span className="hidden sm:inline">Fee Structures</span>
              </button>
              <button onClick={() => { setManagementPage('bursary'); setShowBursaryModal(false); }} className="btn btn-secondary">
                <Award size={16} />
                <span className="hidden sm:inline">Bursary</span>
              </button>
              <button onClick={() => { setManagementPage('discount'); setShowDiscountModal(false); }} className="btn btn-secondary">
                <Percent size={16} />
                <span className="hidden sm:inline">Discount</span>
              </button>
              <button
                onClick={handleBulkInvoiceAllClasses}
                className="btn btn-secondary"
                title="Invoice all students in all classes using their fee structures"
              >
                <Users size={16} />
                <span className="hidden sm:inline">Invoice All Classes</span>
              </button>
              <button 
                onClick={() => { setManagementPage('structures'); setShowStructureModal(false); }}
                className="btn btn-primary shadow-lg shadow-primary-500/25"
              >
                <Plus size={18} /> Generate Invoices
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card-solid-indigo invoice-stat-card p-5">
              <div className="flex items-center gap-4">
                <div className="stat-icon stat-icon-violet text-white">
                  <FileText size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white/80">Total Invoiced</p>
                  <FitStatValue>
                    {formatMoney(stats.total)}
                  </FitStatValue>
                </div>
              </div>
            </div>
            <div className="card-solid-emerald invoice-stat-card p-5">
              <div className="flex items-center gap-4">
                <div className="stat-icon stat-icon-green text-white">
                  <DollarSign size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white/80">Collected</p>
                  <FitStatValue>
                    {formatMoney(stats.collected)}
                  </FitStatValue>
                </div>
              </div>
            </div>
            <div className="card-solid-rose invoice-stat-card p-5">
              <div className="flex items-center gap-4">
                <div className="stat-icon stat-icon-red text-white">
                  <Clock size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white/80">Pending</p>
                  <FitStatValue>
                    {formatMoney(stats.pending)}
                  </FitStatValue>
                </div>
              </div>
            </div>
            <div className="card-solid-amber invoice-stat-card p-5">
              <div className="flex items-center gap-4">
                <div className="stat-icon text-white" style={{background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}}>
                  <Award size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white/80">Bursary</p>
                  <FitStatValue>
                    {formatMoney(stats.bursary)}
                  </FitStatValue>
                </div>
              </div>
            </div>
            <div className="card-solid-cyan invoice-stat-card p-5">
              <div className="flex items-center gap-4">
                <div className="stat-icon stat-icon-blue text-white">
                  <Percent size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white/80">Discount</p>
                  <FitStatValue>
                    {formatMoney(stats.discount)}
                  </FitStatValue>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {managementPage && (
        <div className="space-y-5">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Finance Management</p>
                <h1 className="mt-1 text-2xl font-bold text-slate-800 dark:text-white">
                  {managementPage === 'structures' ? 'Fee Structures' : managementPage === 'bursary' ? 'Bursary Management' : 'Discount Management'}
                </h1>
                <p className="text-sm text-slate-500">
                  {managementPage === 'structures'
                    ? 'Set class fees and requirements, then apply them to students or other classes.'
                    : managementPage === 'bursary'
                      ? 'Select students for full or partial bursary support for the selected term.'
                      : 'Select students and apply fixed or percentage discounts for the selected term.'}
                </p>
              </div>
              <button onClick={() => setManagementPage(null)} className="btn btn-secondary">
                <ArrowRight size={16} className="rotate-180" /> Back to Invoices
              </button>
            </div>
          </div>

          {managementPage === 'structures' && (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
                <div className="relative z-[80] dropdown-parent">
                  <label className="form-label">Class / Grade</label>
                  <PortalSelect value={selectedClassId} onChange={setSelectedClassId} options={classes.map(c => ({ value: c.id, label: c.name }))} />
                </div>
                <div className="relative z-[80] dropdown-parent">
                  <label className="form-label">Term</label>
                  <PortalSelect className="w-32" value={selectedTerm} onChange={setSelectedTerm} options={[1, 2, 3].map(term => ({ value: String(term), label: `Term ${term}` }))} />
                </div>
                <div className="relative z-[80] dropdown-parent">
                  <label className="form-label">Year</label>
                  <PortalSelect
                    className="w-32"
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: String(year), label: String(year) }))}
                  />
                </div>
                <button onClick={() => setShowAddStructureForm(true)} className="btn btn-primary">
                  <Plus size={16} /> Add Fee
                </button>
              </div>

              {showAddStructureForm && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <h3 className="mb-3 font-semibold text-emerald-800 dark:text-emerald-200">Add Fee Structure</h3>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    <input value={newStructure.name} onChange={(e) => setNewStructure({ ...newStructure, name: e.target.value })} className="form-input" placeholder="Name" />
                    <PortalSelect value={newStructure.category} onChange={value => setNewStructure({ ...newStructure, category: value as FeeCategory })} options={Object.values(FeeCategory).map(category => ({ value: category, label: getCategoryLabel(category) }))} />
                    <input type="number" value={newStructure.amount || ''} onChange={(e) => setNewStructure({ ...newStructure, amount: parseFloat(e.target.value) || 0 })} className="form-input" placeholder={`Amount (${currency.symbol})`} />
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                      <input type="checkbox" checked={newStructure.isRequired} onChange={(e) => setNewStructure({ ...newStructure, isRequired: e.target.checked })} />
                      Required
                    </label>
                    <button onClick={handleCreateStructure} disabled={savingStructure} className="btn btn-primary justify-center disabled:opacity-70">
                      {savingStructure ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase text-slate-500">Selected class</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{classes.find(c => c.id === selectedClassId)?.name || 'No class'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase text-slate-500">Items</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{feeStructures.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-semibold uppercase text-slate-500">Total per student</p>
                  <p className="mt-1 text-lg font-bold text-primary-600">{formatMoney(feeStructures.reduce((sum, s) => sum + s.amount, 0))}</p>
                </div>
              </div>

              <div className="table-container">
                <table>
                  <thead><tr><th>No.</th><th>Select</th><th>Name</th><th>Category</th><th>Type</th><th>Amount</th><th>Action</th></tr></thead>
                  <tbody>
                    {feeStructures.length === 0 ? (
                      <tr><td colSpan={7} className="py-10 text-center text-slate-500">No fee structures for this class.</td></tr>
                    ) : feeStructures.map((structure, index) => (
                      <tr key={structure.id}>
                        <td className="font-semibold text-slate-500">{index + 1}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedStructureIds.includes(structure.id)}
                            onChange={(e) => setSelectedStructureIds(prev => e.target.checked ? Array.from(new Set([...prev, structure.id])) : prev.filter(id => id !== structure.id))}
                            className="w-4 h-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="font-medium">{structure.name}</td>
                        <td><span className={`badge ${getCategoryColor(structure.category)}`}>{getCategoryLabel(structure.category)}</span></td>
                        <td>{structure.isRequired ? <span className="badge badge-danger">Requirement</span> : <span className="badge badge-info">Optional fee</span>}</td>
                        <td className="font-bold">{formatMoney(structure.amount)}</td>
                        <td><button onClick={() => handleDeleteStructure(structure.id)} disabled={!!deletingStructureId} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">{deletingStructureId === structure.id ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 size={16} />}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {feeStructures.length > 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 dark:border-slate-600 dark:bg-slate-800">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">Apply selected fees or requirements</p>
                      <p className="text-xs text-slate-500">Copy selected numbered items to other classes.</p>
                    </div>
                    <button onClick={handleApplyStructuresToClasses} disabled={applyingStructures || selectedStructureIds.length === 0 || applyClassIds.length === 0} className="btn btn-secondary disabled:opacity-50">
                      {applyingStructures ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowRight size={16} />} {applyingStructures ? 'Applying...' : 'Apply to Classes'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {classes.filter(c => c.id !== selectedClassId).map((c, index) => (
                      <label key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${applyClassIds.includes(c.id) ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                        <span className="w-6 text-xs font-bold text-slate-400">{index + 1}.</span>
                        <input type="checkbox" checked={applyClassIds.includes(c.id)} onChange={(e) => setApplyClassIds(prev => e.target.checked ? Array.from(new Set([...prev, c.id])) : prev.filter(id => id !== c.id))} className="w-4 h-4 rounded border-slate-300" />
                        <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {managementPage === 'bursary' && (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
                    <div className="relative"><SearchIcon size={18} className="search-input-icon" /><input value={searchStudent} onChange={(e) => setSearchStudent(e.target.value)} className="search-input" placeholder="Search full name or ID..." /></div>
                    <div className="relative z-[80] dropdown-parent"><PortalSelect value={filterBursaryClass} onChange={setFilterBursaryClass} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(c => ({ value: c.id, label: c.name }))]} /></div>
                  </div>
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    {filteredBursaryStudents.map((s, index) => (
                      <label key={s.id} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-700">
                        <span className="w-7 text-xs font-bold text-slate-400">{index + 1}.</span>
                        <input type="checkbox" checked={selectedBursaryStudentIds.includes(s.id)} onChange={(e) => setSelectedBursaryStudentIds(prev => e.target.checked ? Array.from(new Set([...prev, s.id])) : prev.filter(id => id !== s.id))} />
                        <span className="min-w-0"><span className="block font-medium">{s.firstName} {s.lastName}</span><span className="block text-xs text-slate-500">{s.studentId || s.admissionNo || 'No ID'} - {classes.find(c => c.id === s.classId)?.name || 'No class'}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="font-semibold text-amber-800 dark:text-amber-200">{selectedBursaryStudentIds.length} selected</p>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newBursary.isFull} onChange={(e) => setNewBursary({ ...newBursary, isFull: e.target.checked, amount: e.target.checked ? 0 : newBursary.amount })} />Full bursary</label>
                  <input type="number" value={newBursary.amount || ''} onChange={(e) => setNewBursary({ ...newBursary, amount: parseFloat(e.target.value) || 0 })} className="form-input" placeholder={`Amount (${currency.symbol})`} disabled={newBursary.isFull} />
                  <button onClick={handleAddBursary} disabled={savingBursary} className="btn btn-primary w-full justify-center disabled:opacity-70">{savingBursary ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <UserPlus size={16} />} {savingBursary ? 'Saving...' : 'Add Bursary'}</button>
                </div>
              </div>
              <div className="table-container"><table><thead><tr><th>No.</th><th>Student</th><th>Term</th><th>Type</th><th>Amount</th><th>Action</th></tr></thead><tbody>{currentTermBursaries.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-slate-500">No bursaries for Term {selectedTerm}, {selectedYear}.</td></tr> : currentTermBursaries.map((b, index) => <tr key={b.id}><td className="font-semibold text-slate-500">{index + 1}</td><td className="font-medium">{b.studentName}</td><td>Term {b.term}, {b.year}</td><td>{b.isFull ? <span className="badge badge-success">Full bursary</span> : <span className="badge badge-warning">Partial</span>}</td><td className="font-bold text-amber-600">{b.isFull ? 'Paid in full' : formatMoney(b.amount)}</td><td><button onClick={() => handleDeleteBursary(b.id)} disabled={!!deletingBursaryId} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">{deletingBursaryId === b.id ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 size={16} />}</button></td></tr>)}</tbody></table></div>
            </div>
          )}

          {managementPage === 'discount' && (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
                    <div className="relative"><SearchIcon size={18} className="search-input-icon" /><input value={searchDiscountStudent} onChange={(e) => setSearchDiscountStudent(e.target.value)} className="search-input" placeholder="Search full name or ID..." /></div>
                    <div className="relative z-[80] dropdown-parent"><PortalSelect value={filterDiscountClass} onChange={setFilterDiscountClass} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(c => ({ value: c.id, label: c.name }))]} /></div>
                  </div>
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    {filteredDiscountStudents.map((s, index) => (
                      <label key={s.id} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-700">
                        <span className="w-7 text-xs font-bold text-slate-400">{index + 1}.</span>
                        <input type="checkbox" checked={selectedDiscountStudentIds.includes(s.id)} onChange={(e) => setSelectedDiscountStudentIds(prev => e.target.checked ? Array.from(new Set([...prev, s.id])) : prev.filter(id => id !== s.id))} />
                        <span className="min-w-0"><span className="block font-medium">{s.firstName} {s.lastName}</span><span className="block text-xs text-slate-500">{s.studentId || s.admissionNo || 'No ID'} - {classes.find(c => c.id === s.classId)?.name || 'No class'}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800 dark:bg-cyan-900/20">
                  <p className="font-semibold text-cyan-800 dark:text-cyan-200">{selectedDiscountStudentIds.length} selected</p>
                  <PortalSelect value={newDiscount.type} onChange={value => setNewDiscount({ ...newDiscount, type: value as 'fixed' | 'percentage' })} options={[{ value: 'fixed', label: 'Fixed Amount' }, { value: 'percentage', label: 'Percentage (%)' }]} />
                  <input type="number" value={newDiscount.amount || ''} onChange={(e) => setNewDiscount({ ...newDiscount, amount: parseFloat(e.target.value) || 0 })} className="form-input" placeholder={newDiscount.type === 'percentage' ? '10' : `Amount (${currency.symbol})`} max={newDiscount.type === 'percentage' ? 100 : undefined} />
                  <button onClick={handleAddDiscount} disabled={savingDiscount} className="btn btn-primary w-full justify-center disabled:opacity-70">{savingDiscount ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Plus size={16} />} {savingDiscount ? 'Saving...' : 'Add Discount'}</button>
                </div>
              </div>
              <div className="table-container"><table><thead><tr><th>No.</th><th>Student</th><th>Class</th><th>Term</th><th>Discount</th><th>Action</th></tr></thead><tbody>{currentTermDiscounts.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-slate-500">No discounts for Term {selectedTerm}, {selectedYear}.</td></tr> : currentTermDiscounts.map((d, index) => <tr key={d.id}><td className="font-semibold text-slate-500">{index + 1}</td><td className="font-medium">{d.studentName || 'Discount'}</td><td>{d.className || '-'}</td><td>Term {d.term}, {d.year}</td><td className="font-bold text-cyan-600">{d.type === 'percentage' ? `${d.amount}%` : formatMoney(d.amount)}</td><td><button onClick={() => handleDeleteDiscount(d.id)} disabled={!!deletingDiscountId} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">{deletingDiscountId === d.id ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 size={16} />}</button></td></tr>)}</tbody></table></div>
            </div>
          )}
        </div>
      )}

      {!managementPage && <div className="card">
        <div className="card-header">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => { setViewMode('invoices'); setFilterStatus('all'); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'invoices' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <FileText size={16} />
                Invoice List
              </button>
              <button
                onClick={() => { setViewMode('students'); setFilterStatus('all'); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'students' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <Users size={16} />
                Student View
              </button>
            </div>
            <div className="relative min-w-[180px] flex-1 basis-[220px] lg:max-w-[360px] xl:max-w-[420px]">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={viewMode === 'students' ? "Search students..." : "Search invoices..."}
                className="search-input"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 overflow-visible">
              <button
                ref={statusFilterButtonRef}
                onClick={() => {
                  setStatusDropdownPos(getDropdownPosition(statusFilterButtonRef.current));
                  setShowStatusFilter(!showStatusFilter);
                  setShowTermFilter(false);
                }}
                className={`btn btn-secondary h-10 w-[96px] justify-center gap-1.5 px-2 text-sm sm:w-[108px] ${filterStatus !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
              >
                <Filter size={16} />
                <span className="hidden sm:inline">
                  {viewMode === 'students' 
                    ? (filterStatus === 'all' ? 'All' : filterStatus === 'invoiced' ? 'Invoiced' : filterStatus === 'not_invoiced' ? 'Not Invoiced' : filterStatus === 'paid' ? 'Paid' : 'Pending')
                    : (filterStatus === 'all' ? 'All Status' : filterStatus === 'paid' ? 'Paid' : filterStatus === 'partial' ? 'Partial' : 'Pending')
                  }
                </span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${showStatusFilter ? 'rotate-180' : ''}`} />
              </button>
              {showStatusFilter && createPortal(
                <div
                  className="fixed w-56 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[99999] animate-dropdown-in"
                  style={{
                    ...statusDropdownPos,
                    animationDuration: '400ms',
                    animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    animationFillMode: 'forwards',
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="py-1">
                    {(viewMode === 'students'
                      ? [
                          { value: 'all', label: 'All Students', icon: CheckCircle },
                          { value: 'invoiced', label: 'Invoiced', icon: CheckCircle, iconClass: 'text-emerald-500' },
                          { value: 'not_invoiced', label: 'Not Invoiced', icon: XCircle, iconClass: 'text-orange-500' },
                          { value: 'paid', label: 'Cleared (Paid)', icon: CheckCircle, iconClass: 'text-green-500' },
                          { value: 'pending', label: 'With Balance', icon: Clock, iconClass: 'text-amber-500' },
                        ]
                      : [
                          { value: 'all', label: 'All Status', icon: CheckCircle },
                          { value: 'paid', label: 'Paid', icon: CheckCircle, iconClass: 'text-emerald-500' },
                          { value: 'partial', label: 'Partial', icon: Clock, iconClass: 'text-amber-500' },
                          { value: 'pending', label: 'Pending', icon: XCircle, iconClass: 'text-red-500' },
                          { value: 'overdue', label: 'Overdue', icon: XCircle, iconClass: 'text-red-600' },
                        ]
                    ).map(({ value, label, icon: Icon, iconClass }) => (
                      <button
                        key={value}
                        onClick={() => { setFilterStatus(value); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterStatus === value
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Icon size={16} className={iconClass} />
                        {label}
                        {filterStatus === value && <CheckIcon size={14} className="ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body
              )}

              <button
                ref={termFilterButtonRef}
                onClick={() => {
                  setTermDropdownPos(getDropdownPosition(termFilterButtonRef.current));
                  setShowTermFilter(!showTermFilter);
                  setShowStatusFilter(false);
                }}
                className={`btn btn-secondary h-10 w-[82px] justify-center gap-1.5 px-2 text-sm sm:w-[96px] ${filterTerm !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
              >
                <span className="hidden sm:inline">
                  {filterTerm === 'all' ? 'All Terms' : `Term ${filterTerm}`}
                </span>
                <span className="sm:hidden">Terms</span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${showTermFilter ? 'rotate-180' : ''}`} />
              </button>
              {showTermFilter && createPortal(
                <div
                  className="fixed w-56 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[99999] animate-dropdown-in"
                  style={{
                    ...termDropdownPos,
                    animationDuration: '400ms',
                    animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                    animationFillMode: 'forwards',
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="py-1">
                    {['all', '1', '2', '3'].map(term => (
                      <button
                        key={term}
                        onClick={() => { setFilterTerm(term); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === term
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {term === 'all' ? 'All Terms' : `Term ${term}`}
                        {filterTerm === term && <CheckIcon size={14} className="ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>,
                document.body
              )}
              {viewMode === 'invoices' && (
                <>
                  <PortalSelect className="h-10 w-[170px] max-w-full text-sm sm:w-[190px] xl:w-[210px]" value={filterClassId} onChange={setFilterClassId} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(cls => ({ value: cls.id, label: cls.name }))]} />
                  <PortalSelect className="h-10 w-[180px] max-w-full text-sm sm:w-[200px] xl:w-[220px]" value={filterStructure} onChange={setFilterStructure} options={[{ value: 'all', label: 'All Fee Items' }, ...invoiceStructureOptions.map(name => ({ value: name, label: name }))]} />
                  {(filterClassId !== 'all' || filterStructure !== 'all') && (
                    <button
                      onClick={() => { setFilterClassId('all'); setFilterStructure('all'); }}
                      className="btn btn-secondary"
                    >
                      <X size={16} /> Clear
                    </button>
                  )}
                  {selectedInvoiceIds.length > 0 && (
                    <button
                      onClick={handleDeleteSelectedInvoices}
                      disabled={!!deletingInvoiceId}
                      className="btn bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                      title="Delete invoices selected by double-clicking rows"
                    >
                      {deletingInvoiceId === 'bulk' ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Trash2 size={16} />}
                      Delete Selected ({selectedInvoiceIds.length})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="table-container">
          {viewMode === 'students' ? (
            <>
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Student</th>
                  <th>ID</th>
                  <th>Invoices</th>
                  <th>Last Term</th>
                  <th>Current Term Total</th>
                  <th>Total Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="h-9 w-9 rounded-full border-4 border-primary-200 border-t-primary-500 animate-spin" />
                        <p className="text-sm font-semibold">Loading invoice records...</p>
                      </div>
                    </td>
                  </tr>
                ) : !studentInvoiceSummary || studentInvoiceSummary.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                          <Users size={32} className="text-violet-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No students found</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredStudentSummary.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                          <Search size={32} className="text-violet-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No students match your filter</p>
                      </div>
                    </td>
                  </tr>
                ) : visibleFilteredStudentSummary.map((student, index) => (
                  <tr
                    key={student.id}
                    className="cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors"
                    onClick={() => setSelectedStudentForView(student)}
                  >
                    <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                    <td className="font-medium text-indigo-600 dark:text-indigo-400">{student.studentName}</td>
                    <td className="text-slate-500">{student.admissionNo}</td>
                    <td>
                      <span className="badge badge-info">{student.invoiceCount}</span>
                    </td>
                    <td>
                      {student.openingBalance > 0 ? (
                        <span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">{formatMoney(student.openingBalance)}</span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </td>
                    <td>
                      <span className="font-semibold">{formatMoney(student.currentTermTotal)}</span>
                      {student.openingBalance > 0 && (
                        <span className="ml-2 badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 text-[10px]">
                          bal
                        </span>
                      )}
                    </td>
                    <td className="text-emerald-600 font-semibold">{formatMoney(student.totalPaid)}</td>
                    <td className={student.balance > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>
                      {formatMoney(student.balance)}
                    </td>
                    <td>
                      {student.status === 'last_term_balance' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                          <Clock size={12} />
                          Last term balance
                        </span>
                      ) : student.status === 'not_invoiced' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                          <XCircle size={12} />
                          Not Invoiced
                        </span>
                      ) : student.status === 'paid' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          <CheckCircle size={12} />
                          Cleared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <Clock size={12} />
                          Balance
                        </span>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleInvoiceStudent(student.id, student.classId || '')}
                        className="btn btn-secondary text-sm py-1.5"
                      >
                        <Plus size={14} /> Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStudentSummary.length > visibleFilteredStudentSummary.length && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                Showing first {visibleFilteredStudentSummary.length.toLocaleString()} of {filteredStudentSummary.length.toLocaleString()} students to keep the page responsive. Use search or filters to narrow the list.
              </div>
            )}
            </>
          ) : (
            <>
            <table>
              <thead>
                <tr>
                  {selectedInvoiceIds.length > 0 && <th>Select</th>}
                  <th>No.</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Term</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listLoading || !fees || !payments || !allStudents ? (
                  <tr>
                    <td colSpan={selectedInvoiceIds.length > 0 ? 11 : 10} className="text-center py-12">
                      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-500 mx-auto"></div>
                      <p className="mt-3 text-sm font-semibold text-slate-400">Loading invoice records...</p>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={selectedInvoiceIds.length > 0 ? 11 : 10} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                          <FileText size={32} className="text-violet-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No invoices found</p>
                        <button onClick={() => setManagementPage('structures')} className="text-primary-500 hover:text-primary-600 text-sm">
                          Generate invoices from fee structures
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : visibleFilteredInvoices.map((invoice, index) => {
                  const StatusIcon = statusConfig[invoice.status].icon;
                  const isSelected = selectedInvoiceIds.includes(invoice.id);
                  return (
                    <tr
                      key={invoice.id}
                      onDoubleClick={() => toggleInvoiceSelection(invoice.id)}
                      onClick={() => {
                        if (selectedInvoiceIds.length > 0) toggleInvoiceSelection(invoice.id);
                      }}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                      title={selectedInvoiceIds.length > 0 ? 'Click to select or unselect' : 'Double-click to start selecting invoices'}
                    >
                      {selectedInvoiceIds.length > 0 && (
                        <td onDoubleClick={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleInvoiceSelection(invoice.id)}
                            className="h-4 w-4 rounded border-slate-300"
                            title="Select invoice for delete"
                          />
                        </td>
                      )}
                      <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                      <td className="font-medium">{invoice.studentName}</td>
                    <td>{classById.get(invoice.classId || '')?.name || '-'}</td>
                      <td>{invoice.description}</td>
                      <td className="font-semibold">{formatMoney(invoice.amount)}</td>
                      <td className="text-emerald-600 font-semibold">{formatMoney(invoice.paidAmount)}</td>
                      <td className={invoice.amount - invoice.paidAmount > 0 ? 'text-red-600 font-semibold' : ''}>
                        {formatMoney(invoice.amount - invoice.paidAmount)}
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusConfig[invoice.status].bg} ${statusConfig[invoice.status].color}`}>
                          <StatusIcon size={12} />
                          {invoice.status}
                        </span>
                      </td>
                      <td><span className="badge badge-info">Term {invoice.term}</span></td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                        {invoice.status !== 'paid' && (
                          <button
                            onClick={() => openPaymentModal(invoice)}
                            disabled={!!recordingPaymentId}
                            className="btn btn-secondary text-sm py-1.5 disabled:opacity-70"
                          >
                            {recordingPaymentId === invoice.id
                              ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              : <DollarSign size={14} />}
                            {recordingPaymentId === invoice.id ? 'Saving...' : 'Record'}
                          </button>
                        )}
                          <button
                            onClick={() => openEditInvoice(invoice)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                            title="Edit invoice"
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(invoice)}
                            disabled={!!deletingInvoiceId}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
                            title="Delete invoice"
                          >
                            {deletingInvoiceId === invoice.id ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 size={13} />}
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredInvoices.length > visibleFilteredInvoices.length && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                Showing first {visibleFilteredInvoices.length.toLocaleString()} of {filteredInvoices.length.toLocaleString()} invoices to prevent lag. Export still uses all matching invoices.
              </div>
            )}
            </>
          )}
        </div>
      </div>}

      {paymentInvoice && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !recordingPaymentId && setPaymentInvoice(null)}>
          <div
            className="modal-card popup-card-centered w-full"
            style={{ width: 'min(25rem, calc(100vw - 2rem))', maxWidth: '25rem' }}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (!shouldSaveOnEnter(e)) return;
              e.preventDefault();
              void saveInvoicePayment();
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div>
                <h3 className="font-bold text-white">Record Payment</h3>
                <p className="text-xs text-white/75">{paymentInvoice.studentName}</p>
              </div>
              <button onClick={() => setPaymentInvoice(null)} disabled={!!recordingPaymentId} className="rounded-lg p-1.5 transition-colors hover:bg-white/20 disabled:opacity-50">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                <p className="font-semibold text-slate-800 dark:text-white">{paymentInvoice.description}</p>
                <p className="mt-1 text-slate-500">
                  Balance: <span className="font-bold text-red-600">{formatMoney(Math.max(0, paymentInvoice.amount - paymentInvoice.paidAmount))}</span>
                </p>
              </div>
              <div>
                <label className="form-label">Payment Amount ({currency.symbol})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentDraft.amount}
                  onChange={e => setPaymentDraft(prev => ({ ...prev, amount: e.target.value }))}
                  className="form-input"
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label">Payment Method</label>
                <PortalSelect
                  value={paymentDraft.method}
                  onChange={value => setPaymentDraft(prev => ({ ...prev, method: normalizePaymentMethodValue(value) }))}
                  options={paymentMethodOptions}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setPaymentInvoice(null)} className="btn btn-secondary" disabled={!!recordingPaymentId}>Cancel</button>
                <button onClick={saveInvoicePayment} className="btn btn-primary" disabled={!!recordingPaymentId}>
                  {recordingPaymentId === paymentInvoice.id ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <DollarSign size={16} />}
                  {recordingPaymentId === paymentInvoice.id ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingInvoice && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setEditingInvoice(null)}>
          <div
            className="modal-card w-full max-w-lg"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (!shouldSaveOnEnter(e)) return;
              e.preventDefault();
              void handleSaveInvoiceEdit();
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div>
                <h3 className="font-bold text-white">Edit Invoice</h3>
                <p className="text-xs text-white/75">{editingInvoice.studentName}</p>
              </div>
              <button onClick={() => setEditingInvoice(null)} className="rounded-lg p-1.5 transition-colors hover:bg-white/20">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="form-label">Description</label>
                <input value={invoiceDraft.description} onChange={e => setInvoiceDraft(p => ({ ...p, description: e.target.value }))} className="form-input" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="form-label">Amount ({currency.symbol})</label>
                  <input type="number" min="0" step="0.01" value={invoiceDraft.amount} onChange={e => setInvoiceDraft(p => ({ ...p, amount: e.target.value }))} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Due Date</label>
                  <input type="date" value={invoiceDraft.dueDate} onChange={e => setInvoiceDraft(p => ({ ...p, dueDate: e.target.value }))} className="form-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="form-label">Term</label>
                  <PortalSelect value={invoiceDraft.term} onChange={value => setInvoiceDraft(p => ({ ...p, term: value }))} options={[1, 2, 3].map(term => ({ value: String(term), label: `Term ${term}` }))} />
                </div>
                <div>
                  <label className="form-label">Year</label>
                  <input value={invoiceDraft.year} onChange={e => setInvoiceDraft(p => ({ ...p, year: e.target.value }))} className="form-input" />
                </div>
              </div>
              <div>
                <label className="form-label">Status</label>
                <PortalSelect
                  value={invoiceDraft.status}
                  onChange={value => setInvoiceDraft(p => ({ ...p, status: value }))}
                  options={[
                    { value: 'pending', label: 'Pending' },
                    { value: 'partial', label: 'Partial' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'overdue', label: 'Overdue' },
                  ]}
                />
                <p className="mt-1 text-xs text-slate-500">Selecting Paid records the remaining balance as a cash payment.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingInvoice(null)} className="btn btn-secondary" disabled={savingInvoiceEdit}>Cancel</button>
                <button onClick={handleSaveInvoiceEdit} className="btn btn-primary" disabled={savingInvoiceEdit}>
                  {savingInvoiceEdit ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={16} />}
                  {savingInvoiceEdit ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showCreateModal && (
        <div className="fixed inset-x-0 top-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <FileText size={24} className="text-violet-500" />
                Create Bulk Invoice
              </h2>
              <p className="text-sm text-slate-500 mt-1">Invoice multiple students at once</p>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <label className="form-label">Select Students ({selectedStudents.length} selected)</label>
                  <div className="border border-slate-200 dark:border-slate-600 rounded-xl max-h-64 overflow-y-auto">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStudents.length === students.length}
                          onChange={e => setSelectedStudents(e.target.checked ? students.map(s => s.id) : [])}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <span className="font-medium text-sm">Select All Students</span>
                      </label>
                    </div>
                    {students.map((student, index) => (
                      <label key={student.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0">
                        <span className="w-6 text-xs font-bold text-slate-400">{index + 1}.</span>
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedStudents([...selectedStudents, student.id]);
                            } else {
                              setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-slate-500">{student.admissionNo}</p>
                        </div>
                      </label>
                    ))}
                    {students.length === 0 && (
                      <div className="p-6 text-center text-slate-500">
                        <Users size={32} className="mx-auto mb-2 opacity-50" />
                        <p>No active students found</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="form-label">Description</label>
                    <input
                      id="bulk-desc"
                      type="text"
                      className="form-input"
                      placeholder="e.g., Term 1 Tuition Fee"
                    />
                  </div>
                  <div>
                    <label className="form-label">Amount per Student ({currency.symbol})</label>
                    <input
                      id="bulk-amount"
                      type="number"
                      className="form-input"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="form-label">Term</label>
                    <PortalSelect value={bulkInvoiceTerm} onChange={setBulkInvoiceTerm} options={[1, 2, 3].map(term => ({ value: String(term), label: `Term ${term}` }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button onClick={() => { setShowCreateModal(false); setSelectedStudents([]); }} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => {
                  const desc = (document.getElementById('bulk-desc') as HTMLInputElement).value;
                  const amount = parseFloat((document.getElementById('bulk-amount') as HTMLInputElement).value);
                  const term = bulkInvoiceTerm;
                  
                  if (!desc || isNaN(amount) || amount <= 0) {
                    addToast('Please fill all required fields', 'error');
                    return;
                  }

                  handleBulkInvoiceWithData(desc, amount, term);
                }}
                className="btn btn-primary"
              >
                <Plus size={18} /> Create Invoices
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && createPortal((
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget && !isImporting) closeImportModal(); }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Invoices</h2>
              </div>
              <button onClick={closeImportModal} disabled={isImporting} className="p-1 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50">
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
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload Excel or CSV file</p>
                    <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-2 text-sm">Expected Fields:</h4>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {invoiceExpectedFields.map(field => (
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
                        {invoiceExpectedFields.filter(f => f.required).map(field => (
                          <tr key={field.key}>
                            <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap">
                              {field.label}*
                            </td>
                            <td className="px-2 py-1.5">
                              <PortalSelect
                                value={fieldMapping[field.key] || ''}
                                onChange={value => setFieldMapping(prev => ({ ...prev, [field.key]: value }))}
                                className="py-1 text-xs"
                                options={[{ value: '', label: '-- Skip --' }, ...csvHeaders.map(header => ({ value: header, label: header }))]}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={closeImportModal} disabled={isImporting} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={processMapping} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
                      Preview <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'preview' && (
                <div data-preview-fullscreen-root className="space-y-3 rounded-xl bg-white p-1 dark:bg-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 1</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 2</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3</span>
                    </div>
                    <FullscreenButton />
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      <strong>{importPreview.length}</strong> invoices ready to import
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.map((record, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{record.studentName || '-'}</td>
                            <td className="px-2 py-1.5">{record.amount || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between pt-2">
                    <div className="flex-1 max-w-40">
                      {isImporting && (
                        <>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${importProgress}%` }} />
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">{importProgress}% imported</p>
                        </>
                      )}
                    </div>
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm" disabled={isImporting}>Back</button>
                    <button onClick={executeImport} disabled={isImporting} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-70">
                      {isImporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckIcon size={14} />}
                      {isImporting ? 'Importing...' : `Import ${importPreview.length}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}

      {showStructureModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={e => { if (e.target === e.currentTarget) setShowStructureModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700 my-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <GraduationCap size={24} className="text-indigo-500" />
                  Fee Structures by Grade
                </h2>
                <p className="text-sm text-slate-500 mt-1">Set up tuition and fees for each class</p>
              </div>
              <button onClick={() => setShowStructureModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="form-label">Class / Grade</label>
                  <PortalSelect value={selectedClassId} onChange={setSelectedClassId} options={classes.map(c => ({ value: c.id, label: c.name }))} />
                </div>
                <div>
                  <label className="form-label">Term</label>
                  <PortalSelect className="w-32" value={selectedTerm} onChange={setSelectedTerm} options={[1, 2, 3].map(term => ({ value: String(term), label: `Term ${term}` }))} />
                </div>
                <div>
                  <label className="form-label">Year</label>
                  <PortalSelect className="w-28" value={selectedYear} onChange={setSelectedYear} options={[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => ({ value: String(year), label: String(year) }))} />
                </div>
                <button 
                  onClick={() => setShowAddStructureForm(true)}
                  className="btn btn-primary"
                >
                  <Plus size={16} /> Add Fee
                </button>
              </div>
            </div>

            {showAddStructureForm && (
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-emerald-50 dark:bg-emerald-900/20">
                <h4 className="font-medium text-emerald-700 dark:text-emerald-300 mb-3">Add New Fee Structure</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="form-label text-xs">Name *</label>
                    <input
                      type="text"
                      value={newStructure.name}
                      onChange={(e) => setNewStructure({...newStructure, name: e.target.value})}
                      className="form-input"
                      placeholder="e.g., Tuition Fee"
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">Category</label>
                    <PortalSelect
                      value={newStructure.category}
                      onChange={value => setNewStructure({...newStructure, category: value as FeeCategory})}
                      options={Object.values(FeeCategory).map(category => ({ value: category, label: getCategoryLabel(category) }))}
                    />
                  </div>
                  <div>
                    <label className="form-label text-xs">Amount ({currency.symbol}) *</label>
                    <input
                      type="number"
                      value={newStructure.amount || ''}
                      onChange={(e) => setNewStructure({...newStructure, amount: parseFloat(e.target.value) || 0})}
                      className="form-input"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newStructure.isRequired}
                        onChange={(e) => setNewStructure({...newStructure, isRequired: e.target.checked})}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                      <span className="text-sm">Required</span>
                    </label>
                    <button onClick={handleCreateStructure} disabled={savingStructure} className="btn btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-70">
                      {savingStructure ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                      {savingStructure ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => { setShowAddStructureForm(false); setNewStructure({ name: '', category: FeeCategory.TUITION, amount: 0, isRequired: true, description: '' }); }} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="p-5 max-h-[50vh] overflow-y-auto">
              {feeStructures.length === 0 ? (
                <div className="text-center py-12">
                  <GraduationCap size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 font-medium">No fee structures for this class</p>
                  <p className="text-sm text-slate-400 mt-1">Click "Add Fee" to create fee structures</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium text-slate-700 dark:text-slate-300">
                      {feeStructures.length} fee structure{feeStructures.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-sm text-slate-500">
                      Total per student: <span className="font-bold text-primary-600">{formatMoney(feeStructures.reduce((sum, s) => sum + s.amount, 0))}</span>
                    </p>
                  </div>
                  {feeStructureGroups.map(group => (
                    <div key={group.category} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <div className="px-4 py-2 bg-slate-100 dark:bg-slate-700/60 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getCategoryColor(group.category)}`}>
                            {getCategoryLabel(group.category)}
                          </span>
                          <span className="text-xs text-slate-500">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                        </div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {formatMoney(group.items.reduce((sum, structure) => sum + structure.amount, 0))}
                        </span>
                      </div>
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {group.items.map(structure => (
                          <div 
                            key={structure.id}
                            className={`flex items-center justify-between p-3 transition-all ${
                              selectedStructureIds.includes(structure.id)
                                ? 'bg-primary-50 dark:bg-primary-900/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedStructureIds.includes(structure.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStructureIds([...selectedStructureIds, structure.id]);
                                  } else {
                                    setSelectedStructureIds(selectedStructureIds.filter(id => id !== structure.id));
                                  }
                                }}
                                className="w-5 h-5 rounded border-slate-300"
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-slate-800 dark:text-white">{structure.name}</p>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${structure.isRequired ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                                    {structure.isRequired ? 'Requirement' : 'Optional fee'}
                                  </span>
                                </div>
                                {structure.description && (
                                  <p className="text-xs text-slate-500 mt-0.5 truncate">{structure.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                              <span className="font-bold text-lg text-slate-800 dark:text-white">
                                {formatMoney(structure.amount)}
                              </span>
                              <button
                                onClick={() => handleDeleteStructure(structure.id)}
                                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                              >
                                <Trash2 size={16} />
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

            {feeStructures.length > 0 && (
              <div className="px-5 pb-5">
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-4 bg-white dark:bg-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white">Apply selected fees or requirements</p>
                      <p className="text-xs text-slate-500">Copy the selected items to other classes for this term and year.</p>
                    </div>
                    <button
                      onClick={handleApplyStructuresToClasses}
                      disabled={selectedStructureIds.length === 0 || applyClassIds.length === 0}
                      className="btn btn-secondary disabled:opacity-50"
                    >
                      <ArrowRight size={16} /> Apply to Classes
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {classes.filter(c => c.id !== selectedClassId).map(c => (
                      <label key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${applyClassIds.includes(c.id) ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={applyClassIds.includes(c.id)}
                          onChange={(e) => {
                            setApplyClassIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
                          }}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="p-5 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div>
                <p className="text-sm text-slate-500">
                  {selectedStructureIds.length} of {feeStructures.length} selected
                </p>
                {selectedStructureIds.length > 0 && (
                  <p className="font-medium text-primary-600">
                    Total: {formatMoney(feeStructures.filter(s => selectedStructureIds.includes(s.id)).reduce((sum, s) => sum + s.amount, 0))} per student
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowStructureModal(false)} className="btn btn-secondary">
                  Close
                </button>
                <button 
                  onClick={handleGenerateInvoices}
                  disabled={selectedStructureIds.length === 0}
                  className="btn btn-primary disabled:opacity-50"
                >
                  <FileText size={16} /> Apply Fees / Requirements
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {showBursaryModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={e => { if (e.target === e.currentTarget) setShowBursaryModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700 my-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Award size={24} className="text-amber-500" />
                  Bursary Management
                </h2>
                <p className="text-sm text-slate-500 mt-1">Select one or more students. Bursary invoices override class fee structures.</p>
              </div>
              <button onClick={() => setShowBursaryModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="form-label">Search Student</label>
                  <div className="relative">
                    <SearchIcon size={18} className="search-input-icon" />
                    <input
                      type="text"
                      value={searchStudent}
                      onChange={(e) => setSearchStudent(e.target.value)}
                      className="search-input"
                      placeholder="Search full name or ID..."
                    />
                  </div>
                </div>
                <div className="w-40">
                  <label className="form-label">Class Filter</label>
                  <PortalSelect value={filterBursaryClass} onChange={setFilterBursaryClass} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
                </div>
              </div>
              
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 max-h-56 overflow-y-auto">
                  <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{selectedBursaryStudentIds.length} selected</p>
                    <button
                      type="button"
                      onClick={() => {
                        const visibleIds = filteredBursaryStudents.map(s => s.id);
                        const allVisibleSelected = visibleIds.every(id => selectedBursaryStudentIds.includes(id));
                        setSelectedBursaryStudentIds(allVisibleSelected ? selectedBursaryStudentIds.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...selectedBursaryStudentIds, ...visibleIds])));
                      }}
                      className="text-xs font-semibold text-primary-600 hover:underline"
                    >
                      {filteredBursaryStudents.every(s => selectedBursaryStudentIds.includes(s.id)) ? 'Clear visible' : 'Select visible'}
                    </button>
                  </div>
                  {filteredBursaryStudents.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No students match the filter.</p>
                  ) : filteredBursaryStudents.map(s => (
                    <label key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-b-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <span className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedBursaryStudentIds.includes(s.id)}
                          onChange={(e) => setSelectedBursaryStudentIds(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800 dark:text-white truncate">{s.firstName} {s.lastName}</span>
                          <span className="block text-xs text-slate-500 truncate">{s.studentId || s.admissionNo || 'No ID'} · {classes.find(c => c.id === s.classId)?.name || 'No class'}</span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newBursary.isFull}
                      onChange={(e) => setNewBursary({...newBursary, isFull: e.target.checked, amount: e.target.checked ? 0 : newBursary.amount})}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Full bursary</span>
                  </label>
                  <div>
                    <label className="form-label">Invoice amount ({currency.symbol})</label>
                    <input
                      type="number"
                      value={newBursary.amount || ''}
                      onChange={(e) => setNewBursary({...newBursary, amount: parseFloat(e.target.value) || 0})}
                      className="form-input"
                      placeholder="0.00"
                      disabled={newBursary.isFull}
                    />
                  </div>
                  <button 
                    onClick={async () => {
                      if (selectedBursaryStudentIds.length === 0 || (!newBursary.isFull && newBursary.amount <= 0)) {
                        addToast('Select students and enter a bursary amount', 'error');
                        return;
                      }
                      const created: Bursary[] = [];
                      for (const studentId of selectedBursaryStudentIds) {
                        const student = students.find(s => s.id === studentId);
                        if (!student) continue;
                        const bursary: Bursary = {
                          id: uuidv4(),
                          studentId,
                          studentName: `${student.firstName} ${student.lastName}`,
                          amount: newBursary.isFull ? 0 : newBursary.amount,
                          isFull: newBursary.isFull,
                          term: selectedTerm,
                          year: selectedYear,
                          createdAt: new Date().toISOString(),
                        };
                        await dataService.create(sid, 'bursaries', bursary as any);
                        created.push(bursary);
                      }
                      setBursaries([...bursaries, ...created]);
                      setSelectedBursaryStudentIds([]);
                      setNewBursary({ amount: 0, isFull: false });
                      addToast(`Bursary added for ${created.length} student${created.length !== 1 ? 's' : ''}`, 'success');
                    }}
                    className="btn btn-primary w-full justify-center"
                  >
                    <UserPlus size={16} /> Add Bursary
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 max-h-[40vh] overflow-y-auto">
              {currentTermBursaries.length === 0 ? (
                <div className="text-center py-8">
                  <Award size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 font-medium">No bursaries for Term {selectedTerm}, {selectedYear}</p>
                  <p className="text-sm text-slate-400 mt-1">Last-term bursaries stay in last term. Add new bursaries for this term if needed.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentTermBursaries.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <div>
                        <p className="font-medium text-slate-800 dark:text-white">{b.studentName}</p>
                        <p className="text-xs text-slate-500">Term {b.term}, {b.year}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-amber-600">{b.isFull ? 'Full bursary' : formatMoney(b.amount)}</span>
                        <button
                          onClick={async () => {
                            await dataService.delete(sid, 'bursaries', b.id);
                            setBursaries(bursaries.filter(br => br.id !== b.id));
                            addToast('Bursary removed', 'success');
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex justify-between items-center">
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Total Bursary: <span className="text-amber-600 font-bold">{formatMoney(currentTermBursaries.reduce((sum, b) => sum + b.amount, 0))}</span>
                </p>
                <button onClick={() => setShowBursaryModal(false)} className="btn btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {showDiscountModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={e => { if (e.target === e.currentTarget) setShowDiscountModal(false); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700 my-4" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Percent size={24} className="text-cyan-500" />
                  Student Discount Management
                </h2>
                <p className="text-sm text-slate-500 mt-1">Select one or more students and reduce their generated invoices.</p>
              </div>
              <button onClick={() => setShowDiscountModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="form-label">Search Student</label>
                  <div className="relative">
                    <SearchIcon size={18} className="search-input-icon" />
                    <input
                      type="text"
                      value={searchDiscountStudent}
                      onChange={(e) => setSearchDiscountStudent(e.target.value)}
                      className="search-input"
                      placeholder="Search full name or ID..."
                    />
                  </div>
                </div>
                <div className="w-40">
                  <label className="form-label">Class Filter</label>
                  <PortalSelect value={filterDiscountClass} onChange={setFilterDiscountClass} options={[{ value: 'all', label: 'All Classes' }, ...classes.map(c => ({ value: c.id, label: c.name }))]} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 max-h-56 overflow-y-auto">
                  <div className="sticky top-0 z-10 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{selectedDiscountStudentIds.length} selected</p>
                    <button
                      type="button"
                      onClick={() => {
                        const visibleIds = filteredDiscountStudents.map(s => s.id);
                        const allVisibleSelected = visibleIds.every(id => selectedDiscountStudentIds.includes(id));
                        setSelectedDiscountStudentIds(allVisibleSelected ? selectedDiscountStudentIds.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...selectedDiscountStudentIds, ...visibleIds])));
                      }}
                      className="text-xs font-semibold text-primary-600 hover:underline"
                    >
                      {filteredDiscountStudents.every(s => selectedDiscountStudentIds.includes(s.id)) ? 'Clear visible' : 'Select visible'}
                    </button>
                  </div>
                  {filteredDiscountStudents.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No students match the filter.</p>
                  ) : filteredDiscountStudents.map(s => (
                    <label key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-b-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <span className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedDiscountStudentIds.includes(s.id)}
                          onChange={(e) => setSelectedDiscountStudentIds(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-800 dark:text-white truncate">{s.firstName} {s.lastName}</span>
                          <span className="block text-xs text-slate-500 truncate">{s.studentId || s.admissionNo || 'No ID'} · {classes.find(c => c.id === s.classId)?.name || 'No class'}</span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="form-label">Type</label>
                    <PortalSelect value={newDiscount.type} onChange={value => setNewDiscount({...newDiscount, type: value as 'fixed' | 'percentage'})} options={[{ value: 'fixed', label: 'Fixed Amount' }, { value: 'percentage', label: 'Percentage (%)' }]} />
                  </div>
                  <div>
                    <label className="form-label">{newDiscount.type === 'percentage' ? 'Percent' : 'Amount'} ({newDiscount.type === 'percentage' ? '%' : currency.symbol})</label>
                    <input
                      type="number"
                      value={newDiscount.amount || ''}
                      onChange={(e) => setNewDiscount({...newDiscount, amount: parseFloat(e.target.value) || 0})}
                      className="form-input"
                      placeholder={newDiscount.type === 'percentage' ? '10' : '0.00'}
                      max={newDiscount.type === 'percentage' ? 100 : undefined}
                    />
                  </div>
                  <button 
                    onClick={async () => {
                      if (selectedDiscountStudentIds.length === 0 || newDiscount.amount <= 0) {
                        addToast('Select students and enter a discount value', 'error');
                        return;
                      }
                      if (newDiscount.type === 'percentage' && newDiscount.amount > 100) {
                        addToast('Percentage discount cannot exceed 100%', 'error');
                        return;
                      }
                      const created: Discount[] = [];
                      for (const studentId of selectedDiscountStudentIds) {
                        const student = students.find(s => s.id === studentId);
                        if (!student) continue;
                        const discount: Discount = {
                          id: uuidv4(),
                          studentId,
                          studentName: `${student.firstName} ${student.lastName}`,
                          classId: student.classId,
                          className: classes.find(c => c.id === student.classId)?.name || 'No class',
                          amount: newDiscount.amount,
                          type: newDiscount.type,
                          term: selectedTerm,
                          year: selectedYear,
                          createdAt: new Date().toISOString(),
                        };
                        await dataService.create(sid, 'discounts', discount as any);
                        created.push(discount);
                      }
                      setDiscounts([...discounts, ...created]);
                      setSelectedDiscountStudentIds([]);
                      setNewDiscount({ amount: 0, type: 'fixed' });
                      addToast(`Discount added for ${created.length} student${created.length !== 1 ? 's' : ''}`, 'success');
                    }}
                    className="btn btn-primary w-full justify-center"
                  >
                    <Plus size={16} /> Add Discount
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 max-h-[40vh] overflow-y-auto">
              {currentTermDiscounts.length === 0 ? (
                <div className="text-center py-8">
                  <Percent size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 font-medium">No discounts for Term {selectedTerm}, {selectedYear}</p>
                  <p className="text-sm text-slate-400 mt-1">Last-term discounts stay in last term. Add new discounts for this term if needed.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentTermDiscounts.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <div>
                        <p className="font-medium text-slate-800 dark:text-white">{d.studentName || d.className || 'Discount'}</p>
                        <p className="text-xs text-slate-500">Term {d.term}, {d.year}{d.studentName && d.className ? ` · ${d.className}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-cyan-600">
                          {d.type === 'percentage' ? `${d.amount}%` : formatMoney(d.amount)}
                        </span>
                        <button
                          onClick={async () => {
                            await dataService.delete(sid, 'discounts', d.id);
                            setDiscounts(discounts.filter(disc => disc.id !== d.id));
                            addToast('Discount removed', 'success');
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex justify-between items-center">
                <p className="font-medium text-slate-700 dark:text-slate-300">
                  Total Discount Value: <span className="text-cyan-600 font-bold">{formatMoney(currentTermDiscounts.reduce((sum, d) => d.type === 'percentage' ? sum : sum + d.amount, 0))}</span>
                </p>
                <button onClick={() => setShowDiscountModal(false)} className="btn btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Student Invoice Template Modal */}
      {selectedStudentForView && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setSelectedStudentForView(null)}
        >
          <div onClick={e => e.stopPropagation()} className="w-full">
            {(() => {
              const studentRecord: any = allStudents.find((student: any) => student.id === selectedStudentForView.id) || {};
              const classItem = classes.find(cls => cls.id === (selectedStudentForView.classId || studentRecord.classId)) as any;
              const className = classItem?.stream ? `${classItem.name} - Stream ${classItem.stream}` : classItem?.name || 'Class not assigned';
              const classStream = String(studentRecord.stream || classItem?.stream || '').trim();
              const boardingLabel = getBoardingStatus(studentRecord) === 'boarding' ? 'Boarding' : 'Day';
              const studentFees = fees.filter(fee => fee.studentId === selectedStudentForView.id);
              const previousFees = studentFees.filter((fee: any) => isBeforeTerm(fee, activeInvoiceTerm, activeInvoiceYear));
              const currentFees = studentFees
                .filter((fee: any) => String(fee.term) === String(activeInvoiceTerm) && String(fee.year) === String(activeInvoiceYear))
                .sort((a: any, b: any) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());
              const previousIds = new Set(previousFees.map((fee: any) => fee.id));
              const currentIds = new Set(currentFees.map((fee: any) => fee.id));
              const openingBalance = Math.max(
                0,
                previousFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0)
                - payments.filter((payment: any) => previousIds.has(payment.feeId)).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
              );
              const termCharges = currentFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
              const paid = payments.filter((payment: any) => currentIds.has(payment.feeId)).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
              const closingBalance = Math.max(0, openingBalance + termCharges - paid);
              const items = [
                ...(openingBalance > 0 ? [{ description: 'Opening balance from previous term', amount: openingBalance, qty: 1 }] : []),
                ...currentFees.map((fee: any) => ({
                  description: `${fee.description || 'Fee'} - Term ${fee.term || activeInvoiceTerm}, ${fee.year || activeInvoiceYear}`,
                  amount: Number(fee.amount || 0),
                  qty: 1,
                })),
              ];
              return (
                <InvoiceTemplate
                  school={{
                    name: schoolSettings.schoolName || 'School',
                    address: schoolSettings.schoolAddress || '',
                    phone: schoolSettings.schoolPhone || '',
                    email: schoolSettings.schoolEmail || '',
                    logo: schoolSettings.schoolLogo || '',
                    motto: schoolSettings.schoolMotto || 'Education for the Future',
                  }}
                  student={{
                    name: selectedStudentForView.studentName,
                    id: selectedStudentForView.admissionNo || studentRecord.studentId || selectedStudentForView.id,
                    class: className,
                    stream: classStream,
                    boardingStatus: boardingLabel,
                    guardian: studentRecord.guardianName || '',
                    address: studentRecord.address || '',
                    phone: studentRecord.guardianPhone || studentRecord.phone || '',
                    email: studentRecord.guardianEmail || studentRecord.email || '',
                  }}
                  invoice={{
                    number: `INV-${String(selectedStudentForView.id).slice(0, 8).toUpperCase()}-${activeInvoiceTerm}-${activeInvoiceYear}`,
                    date: new Date().toLocaleDateString(),
                    dueDate: currentFees[0]?.dueDate || '',
                    items,
                    subtotal: termCharges,
                    openingBalance,
                    termCharges,
                    tax: 0,
                    total: openingBalance + termCharges,
                    paid,
                    balance: closingBalance,
                    closingBalance,
                    status: closingBalance <= 0 ? 'paid' : 'pending',
                    term: `Term ${activeInvoiceTerm}`,
                    year: activeInvoiceYear,
                  }}
                  bankInfo={bankAccounts[0]}
                  labels={invoiceTemplateLabels}
                  isLiveEditing={isInvoiceTemplateEditing}
                  onToggleLiveEdit={() => setIsInvoiceTemplateEditing(prev => !prev)}
                  onUpdateLabels={updateInvoiceTemplateLabels}
                  onClose={() => setSelectedStudentForView(null)}
                />
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Legacy student invoice detail modal is disabled; template view above is used. */}
      {false && selectedStudentForView && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => setSelectedStudentForView(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-modal-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div>
                <h3 className="font-bold text-white text-lg">{selectedStudentForView.studentName}</h3>
                <p className="text-white/70 text-sm">{selectedStudentForView.admissionNo} · All Invoices</p>
              </div>
              <button onClick={() => setSelectedStudentForView(null)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Summary bar */}
            <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700 border-b border-slate-200 dark:border-slate-700">
              {[
                { label: 'Total Invoiced', value: formatMoney(selectedStudentForView.totalInvoiced), color: 'text-slate-800 dark:text-white' },
                { label: 'Total Paid', value: formatMoney(selectedStudentForView.totalPaid), color: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Balance', value: formatMoney(selectedStudentForView.balance), color: selectedStudentForView.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="px-5 py-3 text-center">
                  <p className="text-xs text-slate-400 mb-0.5">{s.label}</p>
                  <p className={`font-bold text-base ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Term ledger summary for invoice template */}
            {(() => {
              const studentFees = fees.filter(f => f.studentId === selectedStudentForView.id);
              const activeYear = activeInvoiceYear;
              const activeTerm = activeInvoiceTerm;
              const previousFees = studentFees.filter((f: any) => isBeforeTerm(f, activeTerm, activeYear));
              const currentFees = studentFees.filter((f: any) => String(f.term) === String(activeTerm) && String(f.year) === String(activeYear));
              const previousIds = new Set(previousFees.map((f: any) => f.id));
              const currentIds = new Set(currentFees.map((f: any) => f.id));
              const opening = Math.max(0, previousFees.reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0) - payments.filter((p: any) => previousIds.has(p.feeId)).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0));
              const invoiced = currentFees.reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0);
              const currentTotal = opening + invoiced;
              const paid = payments.filter((p: any) => currentIds.has(p.feeId)).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
              const closing = Math.max(0, opening + invoiced - paid);
              return (
                <div className="grid grid-cols-4 divide-x divide-slate-200 dark:divide-slate-700 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/30">
                  {[
                    { label: `Opening T${activeTerm}`, value: formatMoney(opening), color: opening > 0 ? 'text-amber-600' : 'text-slate-700 dark:text-slate-200' },
                    { label: `Current Term ${activeTerm}`, value: formatMoney(currentTotal), color: 'text-indigo-600 dark:text-indigo-300' },
                    { label: 'Paid', value: formatMoney(paid), color: 'text-emerald-600 dark:text-emerald-300' },
                    { label: 'Closing', value: formatMoney(closing), color: closing > 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300' },
                  ].map(s => (
                    <div key={s.label} className="px-4 py-3 text-center">
                      <p className="text-[11px] text-slate-400 mb-0.5">{s.label}</p>
                      <p className={`font-bold text-sm ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Invoice list */}
            <div className="overflow-y-auto flex-1">
              {(() => {
                const studentFees = fees.filter(f => f.studentId === selectedStudentForView.id);
                const activeYear = activeInvoiceYear;
                const activeTerm = activeInvoiceTerm;
                const previousFees = studentFees
                  .filter((f: any) => isBeforeTerm(f, activeTerm, activeYear))
                  .sort((a: any, b: any) => Number(a.year || 0) - Number(b.year || 0) || termRank(a.term) - termRank(b.term));
                const currentFees = studentFees
                  .filter((f: any) => String(f.term) === String(activeTerm) && String(f.year) === String(activeYear))
                  .sort((a: any, b: any) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime());
                const previousIds = new Set(previousFees.map((fee: any) => fee.id));
                const opening = Math.max(0, previousFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0) - payments.filter((payment: any) => previousIds.has(payment.feeId)).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0));
                if (studentFees.length === 0) {
                  return (
                    <div className="flex flex-col items-center gap-3 py-12">
                      <FileText size={32} className="text-slate-300" />
                      <p className="text-slate-400 text-sm">No invoices yet</p>
                      <button onClick={() => { setSelectedStudentForView(null); handleInvoiceStudent(selectedStudentForView.id, selectedStudentForView.classId || ''); }} className="btn btn-primary text-sm py-1.5">
                        <Plus size={14} /> Generate Invoice
                      </button>
                    </div>
                  );
                }
                const renderFeeRows = (rows: any[], mode: 'previous' | 'current', startAt = 0) => rows.map((fee: any, index: number) => {
                  const feePayments = payments.filter(p => p.feeId === fee.id);
                  const paid = feePayments.reduce((s: number, p: any) => s + p.amount, 0);
                  const bal = fee.amount - paid;
                  const status = bal <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
                  return (
                    <tr key={fee.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-5 py-3 text-xs font-semibold text-slate-400">{startAt + index + 1}</td>
                      <td className="px-5 py-3 font-medium text-slate-800 dark:text-white">{fee.description}</td>
                      <td className="px-5 py-3"><span className={`badge text-xs ${mode === 'previous' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' : 'badge-info'}`}>Term {fee.term}, {fee.year}</span></td>
                      <td className="px-5 py-3 text-right font-semibold">{formatMoney(fee.amount)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600">{formatMoney(paid)}</td>
                      <td className={`px-5 py-3 text-right font-semibold ${bal > 0 ? (mode === 'previous' ? 'text-pink-600 dark:text-pink-300' : 'text-red-600') : 'text-emerald-600'}`}>{formatMoney(bal)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`badge text-xs ${status === 'paid' ? 'badge-success' : status === 'partial' ? 'badge-warning' : mode === 'previous' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' : 'badge-danger'}`}>{mode === 'previous' && status !== 'paid' ? 'carried' : status}</span>
                      </td>
                    </tr>
                  );
                });
                return (
                  <div className="space-y-4 p-4">
                    <div className="overflow-hidden rounded-xl border border-pink-200 dark:border-pink-900/50">
                      <div className="bg-pink-50 px-4 py-2 dark:bg-pink-900/20">
                        <p className="text-sm font-semibold text-pink-700 dark:text-pink-300">Previous Term Details / Opening Balance</p>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">No.</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Term</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Paid</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                            <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {previousFees.length === 0 ? (
                            <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-400">No previous term details.</td></tr>
                          ) : renderFeeRows(previousFees, 'previous')}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="bg-slate-50 px-4 py-2 dark:bg-slate-800/70">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white">Current Term {activeTerm}, {activeYear}</p>
                        {opening > 0 && <p className="text-xs font-medium text-pink-600 dark:text-pink-300">Includes opening balance of {formatMoney(opening)} carried into the current term.</p>}
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-700/50">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">No.</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Term</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Paid</th>
                            <th className="px-5 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                            <th className="px-5 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {opening > 0 && (
                            <tr className="bg-pink-50/80 dark:bg-pink-900/10">
                              <td className="px-5 py-3 text-xs font-semibold text-pink-500">{1}</td>
                              <td className="px-5 py-3 font-medium text-slate-800 dark:text-white">Opening Bal</td>
                              <td className="px-5 py-3"><span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">Current Term {activeTerm}, {activeYear}</span></td>
                              <td className="px-5 py-3 text-right font-semibold">{formatMoney(opening)}</td>
                              <td className="px-5 py-3 text-right text-emerald-600">{formatMoney(0)}</td>
                              <td className="px-5 py-3 text-right font-semibold text-pink-600 dark:text-pink-300">{formatMoney(opening)}</td>
                              <td className="px-5 py-3 text-center"><span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 text-xs">current bal</span></td>
                            </tr>
                          )}
                          {currentFees.length === 0 && opening <= 0 ? (
                            <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-400">No current term invoices yet.</td></tr>
                          ) : renderFeeRows(currentFees, 'current', opening > 0 ? 1 : 0)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Payment Accounts */}
              {bankAccounts.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Payment Accounts</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {bankAccounts.map((acc, i) => (
                      <div key={i} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                        <p className="font-semibold text-slate-800 dark:text-white text-sm">{acc.bankName || acc.paymentMethod || `Account ${i + 1}`}</p>
                        {acc.bankBranch && <p className="text-xs text-slate-500 mt-0.5">Branch: {acc.bankBranch}</p>}
                        <p className="text-xs text-slate-500 mt-0.5">{acc.accountName}</p>
                        <p className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1">{acc.accountNumber}</p>
                        {acc.paymentMethod && <span className="badge badge-info text-[10px] mt-1">{acc.paymentMethod}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => setSelectedStudentForView(null)} className="btn btn-secondary text-sm py-1.5">Close</button>
              <button
                onClick={() => { setSelectedStudentForView(null); handleInvoiceStudent(selectedStudentForView.id, selectedStudentForView.classId || ''); }}
                className="btn btn-primary text-sm py-1.5"
              >
                <Plus size={14} /> Add Invoice
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {showAccountsModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto bg-black/50 backdrop-blur-sm" onClick={() => setShowAccountsModal(false)}>
          <div className="modal-card w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-white" />
                <div>
                  <h3 className="font-bold text-white">Payment Details</h3>
                  <p className="text-xs text-white/75">These accounts appear on invoices and finance reports.</p>
                </div>
              </div>
              <button onClick={() => setShowAccountsModal(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {accountDrafts.map((account, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <p className="mb-3 text-sm font-bold text-slate-800 dark:text-white">Account {index + 1}</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="form-label">Payment Method</label>
                      <input
                        value={account.paymentMethod}
                        onChange={e => setAccountDrafts(prev => prev.map((item, i) => i === index ? { ...item, paymentMethod: e.target.value } : item))}
                        className="form-input"
                        placeholder="BANK TRANSFER / CASH / MOBILE MONEY"
                      />
                    </div>
                    <div>
                      <label className="form-label">Bank / Provider</label>
                      <input
                        value={account.bankName}
                        onChange={e => setAccountDrafts(prev => prev.map((item, i) => i === index ? { ...item, bankName: e.target.value } : item))}
                        className="form-input"
                        placeholder="Bank, Airtel, MTN..."
                      />
                    </div>
                    <div>
                      <label className="form-label">Branch</label>
                      <input
                        value={account.bankBranch}
                        onChange={e => setAccountDrafts(prev => prev.map((item, i) => i === index ? { ...item, bankBranch: e.target.value } : item))}
                        className="form-input"
                        placeholder="Bank branch"
                      />
                    </div>
                    <div>
                      <label className="form-label">Account Name</label>
                      <input
                        value={account.accountName}
                        onChange={e => setAccountDrafts(prev => prev.map((item, i) => i === index ? { ...item, accountName: e.target.value } : item))}
                        className="form-input"
                        placeholder="School account name"
                      />
                    </div>
                    <div>
                      <label className="form-label">Account / Phone Number</label>
                      <input
                        value={account.accountNumber}
                        onChange={e => setAccountDrafts(prev => prev.map((item, i) => i === index ? { ...item, accountNumber: e.target.value } : item))}
                        className="form-input"
                        placeholder="Account number or mobile money number"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAccountsModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={savePaymentAccounts} disabled={savingAccounts} className="btn btn-primary">
                  {savingAccounts ? 'Saving...' : 'Save Payment Details'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}


