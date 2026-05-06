import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { Plus, FileText, Download, Printer, CheckCircle, XCircle, Clock, DollarSign, Users, ChevronDown, Upload, X, ArrowRight, Check as CheckIcon, Search, Filter, Settings, Trash2, GraduationCap, Save, Percent, Award, Search as SearchIcon, UserPlus } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { PaymentMethod, Fee, FeeStructure, FeeCategory } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { useCurrency } from '../hooks/useCurrency';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useActiveStudents, useStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { getFeeStructuresByClass, createFeeStructure, deleteFeeStructure, getCategoryLabel, getCategoryColor, generateInvoicesFromStructure } from '../utils/feeStructures';
import { ClassOption } from '../utils/classroom';
import DropdownModal from '../components/DropdownModal';

interface Invoice {
  id: string;
  studentId: string;
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
  term: string;
  year: string;
  createdAt: string;
}

interface Discount {
  id: string;
  classId?: string;
  className?: string;
  studentId?: string;
  studentName?: string;
  amount: number;
  type: 'fixed' | 'percentage';
  term: string;
  year: string;
  createdAt: string;
}

// Build: 2026-05-05
export default function Invoices() {
  const { user, schoolId } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTerm, setFilterTerm] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [showTermFilter, setShowTermFilter] = useState(false);
  const { addToast } = useToast();
  const { formatMoney, currency } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const termFilterRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'invoices' | 'students'>('invoices');
  
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
  const [newBursary, setNewBursary] = useState({ studentId: '', amount: 0, reason: '' });
  const [newDiscount, setNewDiscount] = useState({ studentId: '', amount: 0, type: 'fixed' as 'fixed' | 'percentage' });
  const [searchStudent, setSearchStudent] = useState('');
  const [filterBursaryClass, setFilterBursaryClass] = useState<string>('all');
  const [termSettings, setTermSettings] = useState<Record<string, string>>({});
  const [showPromotionBanner, setShowPromotionBanner] = useState(false);
  const [expiredTerm, setExpiredTerm] = useState('');
  // Payment modal
  const [invoicePayModal, setInvoicePayModal] = useState<{ invoiceId: string; studentName: string; description: string; remaining: number } | null>(null);
  const [invoicePayAmount, setInvoicePayAmount] = useState('');
  const [invoicePayMethod, setInvoicePayMethod] = useState<string>(PaymentMethod.CASH);
  const [isRecordingInvoicePayment, setIsRecordingInvoicePayment] = useState(false);

  const students = useActiveStudents();
  const { students: allStudents } = useStudents();
  const sid = schoolId || user?.id || '';
  const { data: feesData, refresh: refreshFees } = useTableData(sid, 'fees');
  const { data: paymentsData, refresh: refreshPayments } = useTableData(sid, 'payments');
  const { data: bursariesData } = useTableData(sid, 'bursaries');
  const { data: discountsData } = useTableData(sid, 'discounts');

  const fees = feesData as any[];
  const payments = paymentsData as any[];
  const bursaries = bursariesData as any[];
  const discounts = discountsData as any[];

  function refreshInvoices() {
    refreshFees();
    refreshPayments();
  }
  const studentInvoiceSummary = useMemo(() => {
    if (!allStudents || !fees || !payments) return [];
    
    return allStudents.map(student => {
      const studentFees = fees.filter(f => f.studentId === student.id);
      const totalInvoiced = studentFees.reduce((sum, f) => sum + f.amount, 0);
      const totalPaid = studentFees.reduce((sum, f) => {
        const feePayments = payments.filter(p => p.feeId === f.id);
        return sum + feePayments.reduce((s, p) => s + p.amount, 0);
      }, 0);
      const balance = totalInvoiced - totalPaid;
      const isInvoiced = studentFees.length > 0;
      const status = !isInvoiced ? 'not_invoiced' : balance <= 0 ? 'paid' : 'pending';
      
      return {
        id: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        classId: student.classId,
        totalInvoiced,
        totalPaid,
        balance,
        invoiceCount: studentFees.length,
        isInvoiced,
        status,
      };
    });
  }, [allStudents, fees, payments]);

  const filteredStudentSummary = studentInvoiceSummary.filter(s => {
    const search = searchTerm.toLowerCase();
    if (search && !s.studentName.toLowerCase().includes(search)) return false;
    if (filterStatus === 'invoiced' && !s.isInvoiced) return false;
    if (filterStatus === 'not_invoiced' && s.isInvoiced) return false;
    if (filterStatus === 'paid' && s.status !== 'paid') return false;
    if (filterStatus === 'pending' && s.balance <= 0) return false;
    return true;
  });

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
      const status = paidAmount >= fee.amount ? 'paid' : paidAmount > 0 ? 'partial' : 'pending';
      
      invoiceMap.set(fee.id, {
        id: fee.id,
        studentId: fee.studentId || '',
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
    // Now using store - no-op kept for compatibility
  }

  async function loadTermSettings() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const stored = await dataService.getAll(id, 'settings');
      const obj: Record<string, string> = {};
      stored.forEach((s: any) => { obj[s.key] = s.value; });
      setTermSettings(obj);
      // Check if current term has ended ? prompt class promotion
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
      setFeeStructures(structures);
      setSelectedStructureIds(structures.filter(s => s.isRequired).map(s => s.id));
    } catch (error) {
      console.error('Failed to load fee structures:', error);
    }
  }

  const [savingStructure, setSavingStructure] = useState(false);

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
      setFeeStructures(prev => [...prev, structure]);
      if (structure.isRequired) {
        setSelectedStructureIds(prev => [...prev, structure.id]);
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
    if (!id) return;
    try {
      await deleteFeeStructure(id, idStructure);
      setFeeStructures(prev => prev.filter(s => s.id !== idStructure));
      setSelectedStructureIds(prev => prev.filter(sid => sid !== idStructure));
      addToast('Fee structure deleted', 'success');
    } catch (error) {
      addToast('Failed to delete fee structure', 'error');
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
      const classDiscounts = discounts.filter(d => d.classId === selectedClassId && d.term === selectedTerm && String(d.year) === String(selectedYear));
      const structuresToApply = feeStructures.filter(s => selectedStructureIds.includes(s.id));
      const baseTotal = structuresToApply.reduce((sum, s) => sum + s.amount, 0);
      const discount = classDiscounts[0];
      const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + 3);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      const yearInt = parseInt(selectedYear);
      const classIdVal = isUUID(selectedClassId) ? selectedClassId : null;
      let invoiceCount = 0;
      const now = new Date().toISOString();

      for (const student of studentsInClass) {
        // Skip if student already has an invoice for this term/year
        const alreadyInvoiced = fees.some(
          f => f.studentId === student.id &&
               String(f.term) === String(selectedTerm) &&
               String(f.year) === String(yearInt)
        );
        if (alreadyInvoiced) continue;

        const studentBursary = classBursaries.find(b => b.studentId === student.id);
        if (studentBursary) {
          await dataService.create(id, 'fees', {
            id: uuidv4(), studentId: student.id, classId: classIdVal,
            description: 'Bursary Invoice', amount: studentBursary.amount,
            paidAmount: 0, dueDate: dueDateStr, term: selectedTerm,
            year: yearInt, status: 'pending', createdAt: now,
          } as any);
          invoiceCount++;
          continue;
        }

        let invoiceAmount = baseTotal;
        let description = structuresToApply.map(s => s.name || s.description || 'Fee').join(', ') || 'School Fees';
        if (discount) {
          if (discount.type === 'percentage') {
            invoiceAmount = Math.max(0, invoiceAmount - (invoiceAmount * discount.amount) / 100);
            description += ` (${discount.amount}% off)`;
          } else {
            invoiceAmount = Math.max(0, invoiceAmount - discount.amount);
          }
        }
        if (invoiceAmount > 0) {
          await dataService.create(id, 'fees', {
            id: uuidv4(), studentId: student.id, classId: classIdVal,
            description, amount: invoiceAmount, paidAmount: 0,
            dueDate: dueDateStr, term: selectedTerm, year: yearInt,
            status: 'pending', createdAt: now,
          } as any);
          invoiceCount++;
        }
      }

      addToast(`Created ${invoiceCount} invoices for ${studentsInClass.length} students`, 'success');
      setShowCreateModal(false);
      setShowStructureModal(false);
      loadBursariesAndDiscounts();
      refreshInvoices();
    } catch (error) {
      console.error('Failed to generate invoices:', error);
      addToast('Failed to generate invoices', 'error');
    }
  }

  async function handleBulkInvoiceWithData(description: string, amount: number, term: string) {
    // Redirect to fee structures instead of manual entry
    setShowCreateModal(false);
    setShowStructureModal(true);
  }

  // Invoice a single student using their class fee structures
  async function handleInvoiceStudent(studentId: string, classId: string) {
    const id = schoolId || user?.id;
    if (!id || !classId) { addToast('Student has no class assigned', 'error'); return; }
    const structures = await getFeeStructuresByClass(id, classId, selectedTerm, selectedYear);
    if (structures.length === 0) {
      // No fee structures - open the structure modal for this class
      setSelectedClassId(classId);
      setShowStructureModal(true);
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

      const allBursaries = bursaries;
      const allDiscounts = discounts;
      const bursary = allBursaries.find((b: any) => b.studentId === studentId && b.term === selectedTerm && b.year === selectedYear);
      const discount = allDiscounts.find((d: any) => d.classId === classId && d.term === selectedTerm && d.year === selectedYear);
      const applicable = structures.filter(s => s.isRequired || s.category === 'tuition' || s.category === 'boarding');
      const baseTotal = applicable.reduce((sum, s) => sum + s.amount, 0);
      const now = new Date().toISOString();
      if (bursary) {
        await dataService.create(id, 'fees', { id: uuidv4(), studentId, classId, description: `Bursary Invoice`, amount: bursary.amount, term: selectedTerm, year: selectedYear, createdAt: now } as any);
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
      for (const cls of classes) {
        const { fees: created } = await generateInvoicesFromStructure(id, cls.id, selectedTerm, selectedYear);
        if (created.length > 0) { totalInvoiced += created.length; classesProcessed++; }
      }
      if (totalInvoiced === 0) {
        addToast('No fee structures found. Set up fee structures per class first.', 'info');
        setShowStructureModal(true);
      } else {
        addToast(`Invoiced ${totalInvoiced} fees across ${classesProcessed} classes`, 'success');
        refreshInvoices();
      }
    } catch { addToast('Bulk invoice failed', 'error'); }
    finally { (window as any).__bulkInvoicing = false; }
  }

  function markAsPaid(invoiceId: string) {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    const remaining = invoice.amount - invoice.paidAmount;
    setInvoicePayModal({
      invoiceId,
      studentName: invoice.studentName,
      description: invoice.description,
      remaining,
    });
    setInvoicePayAmount(String(remaining));
    setInvoicePayMethod(PaymentMethod.CASH);
  }

  async function submitInvoicePayment() {
    const id = schoolId || user?.id;
    if (!id || !invoicePayModal) return;
    const amount = parseFloat(invoicePayAmount);
    if (isNaN(amount) || amount <= 0) { addToast('Enter a valid amount', 'error'); return; }
    setIsRecordingInvoicePayment(true);
    try {
      await dataService.create(id, 'payments', {
        id: uuidv4(),
        feeId: invoicePayModal.invoiceId,
        studentId: invoices.find(i => i.id === invoicePayModal.invoiceId)?.studentId,
        amount,
        method: invoicePayMethod as any,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as any);
      addToast('Payment recorded', 'success');
      setInvoicePayModal(null);
      refreshInvoices();
    } catch { addToast('Failed to record payment', 'error'); }
    finally { setIsRecordingInvoicePayment(false); }
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
    import('xlsx').then(({ utils, writeFile }) => {
      const headers = invoiceExpectedFields.map(f => f.label);
      const sampleRows = [['John Doe', 'Term 1 Tuition', '50000', '1']];
      const ws = utils.aoa_to_sheet([headers, ...sampleRows]);
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 14) }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Invoices');
      writeFile(wb, 'invoices-import-template.xlsx');
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
      invoiceExpectedFields.forEach(field => {
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
    try {
      const now = new Date().toISOString();
      const year = new Date().getFullYear().toString();
      let successCount = 0;

      for (const data of importPreview) {
        const student = students.find(s => `${s.firstName} ${s.lastName}` === data.studentName);
        if (!student) continue;
        const id = schoolId || user?.id;
        if (!id) continue;
        const fee: Fee = {
          id: uuidv4(),
          studentId: student.id,
          description: data.description,
          amount: parseFloat(data.amount),
          term: data.term || '1',
          year,
          createdAt: now,
        };
        await dataService.create(id, 'fees', fee as any);
        successCount++;
      }
      addToast(`Successfully imported ${successCount} invoices`, 'success');
      closeImportModal();
      refreshInvoices();
    } catch (error) { addToast('Failed to import invoices', 'error'); }
  }

  const filteredInvoices = invoices.filter(inv => {
    if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
    if (filterTerm !== 'all' && inv.term !== filterTerm) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (!inv.studentName.toLowerCase().includes(search) && 
          !inv.description.toLowerCase().includes(search)) {
        return false;
      }
    }
    return true;
  });

  const stats = {
    total: invoices.reduce((sum, i) => sum + i.amount, 0),
    collected: invoices.reduce((sum, i) => sum + i.paidAmount, 0),
    pending: invoices.reduce((sum, i) => sum + (i.amount - i.paidAmount), 0),
    count: invoices.length,
    bursary: bursaries.reduce((sum, b) => sum + b.amount, 0),
    discount: discounts.reduce((sum, d) => d.type === 'percentage' ? sum : sum + d.amount, 0),
  };

  const statusConfig = {
    paid: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    partial: { icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    pending: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
    overdue: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
  };

  return (
    <div className="space-y-6">
      {/* Term ended - class promotion banner */}
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
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-[9999] overflow-hidden">
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
          <button onClick={() => { setShowImportModal(true); fileInputRef.current?.click(); }} className="btn btn-secondary">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <button onClick={() => setShowStructureModal(true)} className="btn btn-secondary">
            <Settings size={16} />
            <span className="hidden sm:inline">Fee Structures</span>
          </button>
          <button onClick={() => setShowBursaryModal(true)} className="btn btn-secondary">
            <Award size={16} />
            <span className="hidden sm:inline">Bursary</span>
          </button>
          <button onClick={() => setShowDiscountModal(true)} className="btn btn-secondary">
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
            onClick={() => setShowStructureModal(true)}
            className="btn btn-secondary"
          >
            <Plus size={18} /> Fee Structures
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card-solid-indigo p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-violet text-white">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Total Invoiced</p>
              <p className="text-2xl font-bold text-white">
                {formatMoney(stats.total)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-emerald p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-green text-white">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Collected</p>
              <p className="text-2xl font-bold text-white">
                {formatMoney(stats.collected)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-rose p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-red text-white">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Pending</p>
              <p className="text-2xl font-bold text-white">
                {formatMoney(stats.pending)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-amber p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon text-white" style={{background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}}>
              <Award size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Bursary</p>
              <p className="text-2xl font-bold text-white">
                {formatMoney(stats.bursary)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-cyan p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-blue text-white">
              <Percent size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Discount</p>
              <p className="text-2xl font-bold text-white">
                {formatMoney(stats.discount)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setViewMode('invoices'); setFilterStatus('all'); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'invoices' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <FileText size={16} />
                <span className="hidden sm:inline">Invoice List</span>
                <span className="sm:hidden">Invoices</span>
              </button>
              <button
                onClick={() => { setViewMode('students'); setFilterStatus('all'); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'students' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <Users size={16} />
                <span className="hidden sm:inline">Student View</span>
                <span className="sm:hidden">Students</span>
              </button>
            </div>
            <div className="relative flex-1 min-w-0 w-full sm:max-w-xs">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={viewMode === 'students' ? "Search students..." : "Search invoices..."}
                className="search-input"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowStatusFilter(true)}
                className={`btn btn-secondary flex items-center gap-2 ${filterStatus !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
              >
                <Filter size={16} />
                <span className="hidden sm:inline">
                  {viewMode === 'students' 
                    ? (filterStatus === 'all' ? 'All' : filterStatus === 'invoiced' ? 'Invoiced' : filterStatus === 'not_invoiced' ? 'Not Invoiced' : filterStatus === 'paid' ? 'Paid' : 'Pending')
                    : (filterStatus === 'all' ? 'All Status' : filterStatus === 'paid' ? 'Paid' : filterStatus === 'partial' ? 'Partial' : 'Pending')
                  }
                </span>
                <ChevronDown size={14} />
              </button>
              <DropdownModal
                isOpen={showStatusFilter}
                onClose={() => setShowStatusFilter(false)}
                title={viewMode === 'students' ? "Filter Students" : "Filter by Status"}
                icon={<Filter size={20} />}
              >
                <div className="p-2 space-y-1">
                  {viewMode === 'students' && (
                    <>
                      <button
                        onClick={() => { setFilterStatus('all'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'all' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle size={18} />
                        <span className="font-medium">All Students</span>
                        {filterStatus === 'all' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterStatus('invoiced'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'invoiced' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle size={18} className="text-emerald-500" />
                        <span className="font-medium">Invoiced</span>
                        {filterStatus === 'invoiced' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterStatus('not_invoiced'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'not_invoiced' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <XCircle size={18} className="text-orange-500" />
                        <span className="font-medium">Not Invoiced</span>
                        {filterStatus === 'not_invoiced' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterStatus('paid'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'paid' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle size={18} className="text-green-500" />
                        <span className="font-medium">Cleared (Paid)</span>
                        {filterStatus === 'paid' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterStatus('pending'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'pending' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Clock size={18} className="text-amber-500" />
                        <span className="font-medium">With Balance</span>
                        {filterStatus === 'pending' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                    </>
                  )}
                  {viewMode === 'invoices' && (
                    <>
                      <button
                        onClick={() => { setFilterStatus('all'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'all' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle size={18} />
                        <span className="font-medium">All Status</span>
                        {filterStatus === 'all' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterStatus('paid'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'paid' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle size={18} className="text-emerald-500" />
                        <span className="font-medium">Paid</span>
                        {filterStatus === 'paid' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterStatus('partial'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'partial' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Clock size={18} className="text-amber-500" />
                        <span className="font-medium">Partial</span>
                        {filterStatus === 'partial' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterStatus('pending'); setShowStatusFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                          filterStatus === 'pending' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <XCircle size={18} className="text-red-500" />
                        <span className="font-medium">Pending</span>
                        {filterStatus === 'pending' && <CheckIcon size={16} className="ml-auto" />}
                      </button>
                    </>
                  )}
                </div>
              </DropdownModal>

              <button
                onClick={() => setShowTermFilter(true)}
                className={`btn btn-secondary flex items-center gap-2 ${filterTerm !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
              >
                <span className="hidden sm:inline">
                  {filterTerm === 'all' ? 'All Terms' : `Term ${filterTerm}`}
                </span>
                <span className="sm:hidden">Terms</span>
                <ChevronDown size={14} />
              </button>
              <DropdownModal
                isOpen={showTermFilter}
                onClose={() => setShowTermFilter(false)}
                title="Filter by Term"
                icon={<Filter size={20} />}
              >
                <div className="p-2 space-y-1">
                  <button
                    onClick={() => { setFilterTerm('all'); setShowTermFilter(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      filterTerm === 'all' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-medium">All Terms</span>
                    {filterTerm === 'all' && <CheckIcon size={16} className="ml-auto" />}
                  </button>
                  <button
                    onClick={() => { setFilterTerm('1'); setShowTermFilter(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      filterTerm === '1' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-medium">Term 1</span>
                    {filterTerm === '1' && <CheckIcon size={16} className="ml-auto" />}
                  </button>
                  <button
                    onClick={() => { setFilterTerm('2'); setShowTermFilter(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      filterTerm === '2' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-medium">Term 2</span>
                    {filterTerm === '2' && <CheckIcon size={16} className="ml-auto" />}
                  </button>
                  <button
                    onClick={() => { setFilterTerm('3'); setShowTermFilter(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      filterTerm === '3' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-medium">Term 3</span>
                    {filterTerm === '3' && <CheckIcon size={16} className="ml-auto" />}
                  </button>
                </div>
              </DropdownModal>
            </div>
          </div>
        </div>
        <div className="table-container">
          {viewMode === 'students' ? (
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>ID</th>
                  <th>Invoices</th>
                  <th>Total Invoiced</th>
                  <th>Total Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!studentInvoiceSummary || studentInvoiceSummary.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
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
                    <td colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                          <Search size={32} className="text-violet-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No students match your filter</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredStudentSummary.map(student => (
                  <tr key={student.id}>
                    <td className="font-medium">{student.studentName}</td>
                    <td className="text-slate-500">{student.admissionNo}</td>
                    <td>
                      <span className="badge badge-info">{student.invoiceCount}</span>
                    </td>
                    <td className="font-semibold">{formatMoney(student.totalInvoiced)}</td>
                    <td className="text-emerald-600 font-semibold">{formatMoney(student.totalPaid)}</td>
                    <td className={student.balance > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>
                      {formatMoney(student.balance)}
                    </td>
                    <td>
                      {student.status === 'not_invoiced' ? (
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
                    <td>
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
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Student</th>
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
                {!fees || !payments || !allStudents ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                          <FileText size={32} className="text-violet-400" />
                        </div>
                        <p className="text-slate-500 font-medium">No invoices found</p>
                        <button onClick={() => setShowStructureModal(true)} className="text-primary-500 hover:text-primary-600 text-sm">
                          Generate invoices from fee structures
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredInvoices.map(invoice => {
                  const StatusIcon = statusConfig[invoice.status].icon;
                  return (
                    <tr key={invoice.id}>
                      <td className="font-medium">{invoice.studentName}</td>
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
                        {invoice.status !== 'paid' && (
                          <button
                            onClick={() => markAsPaid(invoice.id)}
                            className="btn btn-secondary text-sm py-1.5"
                          >
                            <DollarSign size={14} /> Record
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
                    {students.map(student => (
                      <label key={student.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0">
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
                    <select id="bulk-term" className="form-input">
                      <option value="1">Term 1</option>
                      <option value="2">Term 2</option>
                      <option value="3">Term 3</option>
                    </select>
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
                  const term = (document.getElementById('bulk-term') as HTMLSelectElement).value;
                  
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
      , document.body)}

      {showImportModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Invoices</h2>
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
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload Excel file (.xlsx)</p>
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
                                  {invoiceExpectedFields.map(f => (<option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>))}
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
                        {importPreview.slice(0, 5).map((record, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{record.studentName || '-'}</td>
                            <td className="px-2 py-1.5">{record.amount || '-'}</td>
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
      , document.body)}

      {showStructureModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700">
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
                  <select 
                    value={selectedClassId} 
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="form-input"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Term</label>
                  <select 
                    value={selectedTerm} 
                    onChange={(e) => setSelectedTerm(e.target.value)}
                    className="form-input w-32"
                  >
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Year</label>
                  <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="form-input w-28"
                  >
                    <option value={new Date().getFullYear().toString()}>{new Date().getFullYear()}</option>
                    <option value={(new Date().getFullYear() + 1).toString()}>{new Date().getFullYear() + 1}</option>
                  </select>
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
                    <select
                      value={newStructure.category}
                      onChange={(e) => setNewStructure({...newStructure, category: e.target.value as FeeCategory})}
                      className="form-input"
                    >
                      <option value={FeeCategory.TUITION}>Tuition</option>
                      <option value={FeeCategory.BOARDING}>Boarding</option>
                      <option value={FeeCategory.EXAM}>Examination</option>
                      <option value={FeeCategory.REGISTRATION}>Registration</option>
                      <option value={FeeCategory.UNIFORM}>Uniform</option>
                      <option value={FeeCategory.BOOKS}>Books</option>
                      <option value={FeeCategory.TRANSPORT}>Transport</option>
                      <option value={FeeCategory.ACTIVITY}>Activity</option>
                      <option value={FeeCategory.OTHER}>Other</option>
                    </select>
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
                  {feeStructures.map(structure => (
                    <div 
                      key={structure.id}
                      className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                        selectedStructureIds.includes(structure.id)
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
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
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-800 dark:text-white">{structure.name}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(structure.category)}`}>
                              {getCategoryLabel(structure.category)}
                            </span>
                            {structure.isRequired && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                Required
                              </span>
                            )}
                          </div>
                          {structure.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{structure.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
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
              )}
            </div>

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
                  <FileText size={16} /> Generate Invoices for Class
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {showBursaryModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-2xl animate-modal-in max-h-[90vh] flex flex-col" style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            {/* Header */}
            <div className="shrink-0 px-7 pt-7 pb-0">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#D1FAE5' }}>
                  <Award size={20} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="font-bold text-slate-900 text-[17px] leading-snug">Bursary / Scholarship</h3>
                  <p className="text-[14px] text-slate-500 mt-1">Grant a bursary to a student — reduces their invoice.</p>
                </div>
                <button onClick={() => setShowBursaryModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* Bursary add form */}
            <div className="px-7 py-4 border-b border-slate-100 bg-slate-50 space-y-3 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Class Filter</label>
                  <select value={filterBursaryClass} onChange={e => setFilterBursaryClass(e.target.value)} className="form-input">
                    <option value="all">All Classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Search Student</label>
                  <div className="relative">
                    <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={searchStudent} onChange={e => setSearchStudent(e.target.value)} className="form-input pl-9" placeholder="Name or ID..." />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="form-label">Student *</label>
                  <select value={newBursary.studentId} onChange={e => setNewBursary({ ...newBursary, studentId: e.target.value })} className="form-input">
                    <option value="">- Select student -</option>
                    {students.filter(s => {
                      if (filterBursaryClass !== 'all' && s.classId !== filterBursaryClass) return false;
                      if (searchStudent) { const q = searchStudent.toLowerCase(); return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || (s.studentId || s.admissionNo || '').toLowerCase().includes(q); }
                      return true;
                    }).slice(0, 30).map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} - {s.studentId || s.admissionNo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Amount ({currency.symbol}) *</label>
                  <input type="number" value={newBursary.amount || ''} onChange={e => setNewBursary({ ...newBursary, amount: parseFloat(e.target.value) || 0 })} className="form-input" placeholder="0.00" min="0" />
                </div>
                <div>
                  <label className="form-label">Reason</label>
                  <input type="text" value={newBursary.reason} onChange={e => setNewBursary({ ...newBursary, reason: e.target.value })} className="form-input" placeholder="e.g. Scholarship" />
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!newBursary.studentId || newBursary.amount <= 0) { addToast('Select a student and enter amount', 'error'); return; }
                  const id = schoolId || user?.id; if (!id) return;
                  const student = students.find(s => s.id === newBursary.studentId);
                  const now = new Date().toISOString();
                  const existing = bursaries.find(b => b.studentId === newBursary.studentId && String(b.term) === String(selectedTerm) && String(b.year) === String(selectedYear));
                  if (existing) await dataService.delete(id, 'bursaries', existing.id);
                  await dataService.create(id, 'bursaries', { id: uuidv4(), studentId: newBursary.studentId, studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown', amount: newBursary.amount, reason: newBursary.reason, term: selectedTerm, year: selectedYear, createdAt: now } as any);
                  const studentFee = fees.find(f => f.studentId === newBursary.studentId && String(f.term) === String(selectedTerm) && String(f.year) === String(selectedYear));
                  if (studentFee) {
                    const newAmt = Math.max(0, studentFee.amount - newBursary.amount);
                    await dataService.update(id, 'fees', studentFee.id, { amount: newAmt, description: (studentFee.description || 'School Fees') + ` (Bursary: ${formatMoney(newBursary.amount)})` } as any);
                    addToast(`Bursary applied - invoice updated to ${formatMoney(newAmt)}`, 'success');
                  } else { addToast('Bursary saved. Will apply when invoice is created.', 'success'); }
                  setNewBursary({ studentId: '', amount: 0, reason: '' });
                }}
                className="btn btn-primary"
              >
                <UserPlus size={15} /> Apply Bursary
              </button>
            </div>

            <div className="px-7 py-4 flex-1 overflow-y-auto">
              {bursaries.length === 0 ? (
                <div className="text-center py-8 text-slate-400"><Award size={36} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No bursaries yet</p></div>
              ) : (
                <div className="space-y-2">
                  {bursaries.map(b => (
                    <div key={b.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-800">{b.studentName}</p>
                        <p className="text-xs text-slate-500">Term {b.term} {b.year}{(b as any).reason ? ` - ${(b as any).reason}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-amber-600">{formatMoney(b.amount)}</span>
                        <button onClick={async () => { await dataService.delete(user!.id, 'bursaries', b.id); addToast('Bursary removed', 'success'); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-7 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              <p className="text-sm font-medium text-slate-600">Total: <span className="text-amber-600 font-bold">{formatMoney(bursaries.reduce((s, b) => s + b.amount, 0))}</span></p>
              <button onClick={() => setShowBursaryModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]" style={{ background: '#F3F4F6' }} onMouseEnter={e => (e.currentTarget.style.background = '#E5E7EB')} onMouseLeave={e => (e.currentTarget.style.background = '#F3F4F6')}>Close</button>
            </div>
          </div>
        </div>
      , document.body)}

      {showDiscountModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-2xl animate-modal-in max-h-[90vh] flex flex-col" style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            {/* Header */}
            <div className="shrink-0 px-7 pt-7 pb-0">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#CFFAFE' }}>
                  <Percent size={20} className="text-cyan-600" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="font-bold text-slate-900 text-[17px] leading-snug">Student Discount</h3>
                  <p className="text-[14px] text-slate-500 mt-1">Apply a discount to a student — updates their invoice.</p>
                </div>
                <button onClick={() => setShowDiscountModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
                  <X size={16} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* Discount add form */}
            <div className="px-7 py-4 border-b border-slate-100 bg-slate-50 space-y-3 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Class Filter</label>
                  <select value={filterBursaryClass} onChange={e => setFilterBursaryClass(e.target.value)} className="form-input">
                    <option value="all">All Classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Search Student</label>
                  <div className="relative">
                    <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={searchStudent} onChange={e => setSearchStudent(e.target.value)} className="form-input pl-9" placeholder="Name or ID..." />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="form-label">Student *</label>
                  <select value={newDiscount.studentId} onChange={e => setNewDiscount({ ...newDiscount, studentId: e.target.value })} className="form-input">
                    <option value="">- Select student -</option>
                    {students.filter(s => {
                      if (filterBursaryClass !== 'all' && s.classId !== filterBursaryClass) return false;
                      if (searchStudent) { const q = searchStudent.toLowerCase(); return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || (s.studentId || s.admissionNo || '').toLowerCase().includes(q); }
                      return true;
                    }).slice(0, 30).map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} - {s.studentId || s.admissionNo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Type</label>
                  <select value={newDiscount.type} onChange={e => setNewDiscount({ ...newDiscount, type: e.target.value as 'fixed' | 'percentage' })} className="form-input">
                    <option value="fixed">Fixed ({currency.symbol})</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">{newDiscount.type === 'percentage' ? 'Percent (%)' : `Amount (${currency.symbol})`} *</label>
                  <input type="number" value={newDiscount.amount || ''} onChange={e => setNewDiscount({ ...newDiscount, amount: parseFloat(e.target.value) || 0 })} className="form-input" placeholder={newDiscount.type === 'percentage' ? '10' : '0.00'} min="0" max={newDiscount.type === 'percentage' ? 100 : undefined} />
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!newDiscount.studentId || newDiscount.amount <= 0) { addToast('Select a student and enter amount', 'error'); return; }
                  const id = schoolId || user?.id; if (!id) return;
                  const student = students.find(s => s.id === newDiscount.studentId);
                  const now = new Date().toISOString();
                  const existing = discounts.find(d => d.studentId === newDiscount.studentId && String(d.term) === String(selectedTerm) && String(d.year) === String(selectedYear));
                  if (existing) await dataService.delete(id, 'discounts', existing.id);
                  await dataService.create(id, 'discounts', { id: uuidv4(), studentId: newDiscount.studentId, studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown', amount: newDiscount.amount, type: newDiscount.type, term: selectedTerm, year: selectedYear, createdAt: now } as any);
                  const studentFee = fees.find(f => f.studentId === newDiscount.studentId && String(f.term) === String(selectedTerm) && String(f.year) === String(selectedYear));
                  if (studentFee) {
                    const discAmt = newDiscount.type === 'percentage' ? (studentFee.amount * newDiscount.amount) / 100 : newDiscount.amount;
                    const newAmt = Math.max(0, studentFee.amount - discAmt);
                    const label = newDiscount.type === 'percentage' ? `${newDiscount.amount}% off` : formatMoney(discAmt);
                    await dataService.update(id, 'fees', studentFee.id, { amount: newAmt, description: (studentFee.description || 'School Fees') + ` (Discount: ${label})` } as any);
                    addToast(`Discount applied - invoice updated to ${formatMoney(newAmt)}`, 'success');
                  } else { addToast('Discount saved. Will apply when invoice is created.', 'success'); }
                  setNewDiscount({ studentId: '', amount: 0, type: 'fixed' });
                }}
                className="btn btn-primary"
              >
                <Plus size={15} /> Apply Discount
              </button>
            </div>

            <div className="px-7 py-4 flex-1 overflow-y-auto">
              {discounts.length === 0 ? (
                <div className="text-center py-8 text-slate-400"><Percent size={36} className="mx-auto mb-2 opacity-40" /><p className="text-sm">No discounts yet</p></div>
              ) : (
                <div className="space-y-2">
                  {discounts.map(d => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50">
                      <div>
                        <p className="font-medium text-slate-800">{(d as any).studentName || d.className || '-'}</p>
                        <p className="text-xs text-slate-500">Term {d.term} {d.year}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-cyan-600">{d.type === 'percentage' ? `${d.amount}%` : formatMoney(d.amount)}</span>
                        <button onClick={async () => { await dataService.delete(user!.id, 'discounts', d.id); addToast('Discount removed', 'success'); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-7 py-4 border-t border-slate-200 flex justify-between items-center shrink-0">
              <p className="text-sm font-medium text-slate-600">Total fixed: <span className="text-cyan-600 font-bold">{formatMoney(discounts.reduce((s, d) => d.type === 'percentage' ? s : s + d.amount, 0))}</span></p>
              <button onClick={() => setShowDiscountModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]" style={{ background: '#F3F4F6' }} onMouseEnter={e => (e.currentTarget.style.background = '#E5E7EB')} onMouseLeave={e => (e.currentTarget.style.background = '#F3F4F6')}>Close</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Invoice Payment Modal */}
      {invoicePayModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setInvoicePayModal(null); }}>
          <div className="modal-card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <h3 className="font-bold text-white flex items-center gap-2">
                <CheckIcon size={18} /> Record Payment
              </h3>
              <button onClick={() => setInvoicePayModal(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <XCircle size={18} className="text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{invoicePayModal.studentName}</p>
                <p className="text-xs text-slate-500">{invoicePayModal.description}</p>
                <p className="text-xs text-slate-500">Remaining: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatMoney(invoicePayModal.remaining)}</span></p>
              </div>
              <div className="space-y-2">
                <label className="form-label">Amount</label>
                <input
                  type="number"
                  value={invoicePayAmount}
                  onChange={e => setInvoicePayAmount(e.target.value)}
                  className="form-input"
                  placeholder="Enter amount"
                  min="0"
                  step="0.01"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="form-label">Method</label>
                <select value={invoicePayMethod} onChange={e => setInvoicePayMethod(e.target.value)} className="form-input">
                  <option value={PaymentMethod.CASH}>Cash</option>
                  <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setInvoicePayModal(null)} className="btn btn-secondary flex-1" disabled={isRecordingInvoicePayment}>Cancel</button>
                <button
                  onClick={submitInvoicePayment}
                  disabled={isRecordingInvoicePayment || !invoicePayAmount || isNaN(parseFloat(invoicePayAmount)) || parseFloat(invoicePayAmount) <= 0}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isRecordingInvoicePayment
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                    : <><CheckIcon size={16} /> Record</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}


