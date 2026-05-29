import React, { useDeferredValue, useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import { DollarSign, Receipt, FileText, Users, Download, Upload, X, Check, ChevronDown, Check as CheckIcon, CreditCard, Search, Filter, ArrowRight, ChevronRight, Building2, Plus, Trash2, Edit, Save, Award, Percent, Printer, Palette } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Fee, Payment, PaymentMethod } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { useCurrency } from '../hooks/useCurrency';
import { exportToPDF, exportToCSV, exportToExcel } from '../utils/export';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { SuccessPopup } from '../components/SuccessPopup';
import { FullscreenButton } from '../components/FullscreenButton';
import LiveEditable from '../components/LiveEditable';
import { matchesStudentSearch } from '../utils/studentSearch';
import { openPrintPreview } from '../utils/printPreview';
import { matchesTextSearch } from '../utils/searchMatch';
import { runTasksInThirtyPercentBatches } from '../utils/bulkDelete';
import { FitStatValue } from '../components/FitStatValue';
import { ProgressiveListLoader, useProgressiveList } from '../hooks/useProgressiveList';

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

function normalizeImportDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

type LedgerTemplate = {
  textColor: string;
  headerColor: string;
  accentColor: string;
  logo: string;
  labels: Record<string, string>;
};

export default function Finance() {
  const { user, schoolId } = useAuth();
  const [activeTab, setActiveTab] = useState<'students' | 'ledger' | 'invoices' | 'payments' | 'accounts'>('students');
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ledgerLogoInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const termFilterRef = useRef<HTMLDivElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [duplicateImportRows, setDuplicateImportRows] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [filterTerm, setFilterTerm] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [showTermFilter, setShowTermFilter] = useState(false);
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());
  const [selectedLedgerStudentId, setSelectedLedgerStudentId] = useState<string | null>(null);
  const [isLedgerLiveEditing, setIsLedgerLiveEditing] = useState(false);
  const [ledgerTemplate, setLedgerTemplate] = useState<LedgerTemplate>(() => {
    try {
      const saved = localStorage.getItem('schofy_ledger_template');
      if (saved) return { textColor: '#0f172a', headerColor: '#4f46e5', accentColor: '#10b981', logo: '', labels: {}, ...JSON.parse(saved) };
    } catch {}
    return { textColor: '#0f172a', headerColor: '#4f46e5', accentColor: '#10b981', logo: '', labels: {} };
  });
  // Payment modal state
  const [payModal, setPayModal] = useState<{ feeId: string; studentId: string; amount: number; studentName: string; description: string } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>(PaymentMethod.CASH);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const student = params.get('student');
    if (tab === 'ledger' || tab === 'invoices' || tab === 'payments' || tab === 'accounts' || tab === 'students') {
      setActiveTab(tab);
    }
    if (student) {
      setSelectedLedgerStudentId(student);
      if (!tab) setActiveTab('ledger');
    }
  }, []);

  const students = useActiveStudents();
  const sid = schoolId || user?.id || '';
  const { data: fees } = useTableData(sid, 'fees');
  const { data: payments } = useTableData(sid, 'payments');
  const { data: settingsData } = useTableData(sid, 'settings');
  const { data: bursariesData } = useTableData(sid, 'bursaries');
  const { data: discountsData } = useTableData(sid, 'discounts');
  const settingsMap = useMemo(() => {
    const obj: Record<string, any> = {};
    (settingsData as any[]).forEach((s: any) => { obj[s.key] = s.value; });
    return obj;
  }, [settingsData]);
  const schoolPrintInfo = useMemo(() => ({
    name: String(settingsMap.schoolName || 'School').trim(),
    address: String(settingsMap.schoolAddress || '').trim(),
    phone: String(settingsMap.schoolPhone || '').trim(),
    email: String(settingsMap.schoolEmail || '').trim(),
    logo: String(settingsMap.schoolLogo || '').trim(),
  }), [settingsMap]);
  function updateLedgerTemplate(next: Partial<typeof ledgerTemplate>) {
    setLedgerTemplate(prev => {
      const merged = { ...prev, ...next };
      localStorage.setItem('schofy_ledger_template', JSON.stringify(merged));
      return merged;
    });
  }
  function handleLedgerLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') updateLedgerTemplate({ logo: reader.result });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }
  function ledgerText(key: string, fallback: string) {
    return ledgerTemplate.labels?.[key] || fallback;
  }
  function updateLedgerText(key: string, value: string) {
    updateLedgerTemplate({ labels: { ...(ledgerTemplate.labels || {}), [key]: value } });
  }
  function editableLedgerText(key: string, fallback: string) {
    return <LiveEditable value={ledgerText(key, fallback)} onSave={value => updateLedgerText(key, value)} isLiveEditing={isLedgerLiveEditing} />;
  }

  // Derive payment accounts from settings
  const bankAccounts = useMemo(() => {
    const accounts = [];
    for (const suffix of ['', '2', '3']) {
      const name = settingsMap[`bankAccountName${suffix}`];
      const number = settingsMap[`bankAccountNumber${suffix}`];
      const bank = settingsMap[`bankName${suffix}`];
      const method = settingsMap[`paymentMethod${suffix}`];
      if (name || number || bank) {
        accounts.push({ accountName: name || '', accountNumber: number || '', bankName: bank || '', paymentMethod: method || '' });
      }
    }
    return accounts;
  }, [settingsMap]);
  const filteredBankAccounts = useMemo(() => {
    return bankAccounts.filter(acc =>
      matchesTextSearch([acc.accountName, acc.accountNumber, acc.bankName, acc.paymentMethod], deferredSearchTerm)
    );
  }, [bankAccounts, deferredSearchTerm]);

  function toggleInvoice(id: string) {
    setExpandedInvoices(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function togglePayment(id: string) {
    setExpandedPayments(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openPayModal(feeId: string, studentId: string, amount: number) {
    const student = students.find(s => s.id === studentId);
    const fee = (fees as any[]).find(f => f.id === feeId);
    setPayModal({
      feeId, studentId, amount,
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
      description: fee?.description || 'Fee',
    });
    setPayAmount(String(amount));
    setPayMethod(PaymentMethod.CASH);
  }

  async function handleRecordPayment(feeId: string, studentId: string, _amount: number) {
    const id = schoolId || user?.id;
    if (!id || !payModal) return;
    if (isRecordingPayment) return;
    const parsed = parseFloat(payAmount);
    if (isNaN(parsed) || parsed <= 0) { addToast('Enter a valid amount', 'error'); return; }
    setIsRecordingPayment(true);
    try {
      await dataService.create(id, 'payments', {
        id: uuidv4(), feeId, studentId,
        amount: parsed,
        method: payMethod as any,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as any);
      addToast('Payment recorded', 'success');
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'payments' } }));
      setPayModal(null);
    } catch { addToast('Failed to record payment', 'error'); }
    finally { setIsRecordingPayment(false); }
  }

  function handleExportInvoicesCSV() {
    const data = fees.map(f => { const s = students.find(x => x.id === f.studentId); return { ...f, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A' }; });
    exportToCSV(data, 'invoices', [{ key: 'studentName' as any, label: 'Student' }, { key: 'description' as any, label: 'Description' }, { key: 'amount' as any, label: 'Amount' }, { key: 'term' as any, label: 'Term' }]);
    addToast('Exported CSV', 'success'); setShowExportMenu(false);
  }
  function handleExportInvoicesExcel() {
    const data = fees.map(f => { const s = students.find(x => x.id === f.studentId); return { ...f, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A' }; });
    exportToExcel(data, 'invoices', [{ key: 'studentName' as any, label: 'Student' }, { key: 'description' as any, label: 'Description' }, { key: 'amount' as any, label: 'Amount' }, { key: 'term' as any, label: 'Term' }]);
    addToast('Exported Excel', 'success'); setShowExportMenu(false);
  }
  function handleExportPaymentsCSV() {
    const data = payments.map(p => { const s = students.find(x => x.id === p.studentId); const fee = fees.find(f => f.id === p.feeId); return { ...p, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A', purpose: fee?.description || '' }; });
    exportToCSV(data, 'payments', [{ key: 'studentName' as any, label: 'Student' }, { key: 'purpose' as any, label: 'Purpose' }, { key: 'amount' as any, label: 'Amount' }, { key: 'method' as any, label: 'Method' }, { key: 'date' as any, label: 'Date' }]);
    addToast('Exported CSV', 'success'); setShowExportMenu(false);
  }
  function handleExportPaymentsExcel() {
    const data = payments.map(p => { const s = students.find(x => x.id === p.studentId); const fee = fees.find(f => f.id === p.feeId); return { ...p, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A', purpose: fee?.description || '' }; });
    exportToExcel(data, 'payments', [{ key: 'studentName' as any, label: 'Student' }, { key: 'purpose' as any, label: 'Purpose' }, { key: 'amount' as any, label: 'Amount' }, { key: 'method' as any, label: 'Method' }, { key: 'date' as any, label: 'Date' }]);
    addToast('Exported Excel', 'success'); setShowExportMenu(false);
  }
  function getLedgerExportRows() {
    return ledgerRows.map(row => ({
      studentName: row.studentName,
      admissionNo: row.admissionNo,
      term: ledgerTerm,
      year: ledgerYear,
      openingBalance: row.openingBalance,
      invoiced: row.invoiced,
      paid: row.paid,
    closingBalance: row.closingBalance,
    upfrontCredit: row.upfrontCredit,
      invoiceCount: row.invoiceCount,
    }));
  }
  function handleExportLedgerCSV() {
    exportToCSV(getLedgerExportRows(), `fee-ledger-term-${ledgerTerm}-${ledgerYear}`, [
      { key: 'studentName' as any, label: 'Student' },
      { key: 'admissionNo' as any, label: 'ID Number' },
      { key: 'term' as any, label: 'Term' },
      { key: 'year' as any, label: 'Year' },
      { key: 'openingBalance' as any, label: 'Opening Balance' },
      { key: 'invoiced' as any, label: 'Invoiced' },
      { key: 'paid' as any, label: 'Paid' },
      { key: 'closingBalance' as any, label: 'Closing Balance' },
      { key: 'upfrontCredit' as any, label: 'Upfront Credit' },
      { key: 'invoiceCount' as any, label: 'Invoices' },
    ]);
    addToast('Ledger exported CSV', 'success'); setShowExportMenu(false);
  }
  function handleExportLedgerExcel() {
    exportToExcel(getLedgerExportRows(), `fee-ledger-term-${ledgerTerm}-${ledgerYear}`, [
      { key: 'studentName' as any, label: 'Student' },
      { key: 'admissionNo' as any, label: 'ID Number' },
      { key: 'term' as any, label: 'Term' },
      { key: 'year' as any, label: 'Year' },
      { key: 'openingBalance' as any, label: 'Opening Balance' },
      { key: 'invoiced' as any, label: 'Invoiced' },
      { key: 'paid' as any, label: 'Paid' },
      { key: 'closingBalance' as any, label: 'Closing Balance' },
      { key: 'upfrontCredit' as any, label: 'Upfront Credit' },
      { key: 'invoiceCount' as any, label: 'Invoices' },
    ]);
    addToast('Ledger exported Excel', 'success'); setShowExportMenu(false);
  }

  function handleExportLedgerPDF() {
    exportToPDF(`Fee Ledger - Term ${ledgerTerm} ${ledgerYear}`, getLedgerExportRows(), [
      { key: 'studentName', label: 'Student' },
      { key: 'admissionNo', label: 'ID Number' },
      { key: 'openingBalance', label: 'Opening Balance' },
      { key: 'invoiced', label: 'Invoiced' },
      { key: 'paid', label: 'Paid' },
      { key: 'closingBalance', label: 'Closing Balance' },
      { key: 'upfrontCredit', label: 'Upfront Credit' },
      { key: 'invoiceCount', label: 'Invoices' },
    ], `fee-ledger-term-${ledgerTerm}-${ledgerYear}`);
    addToast('Ledger exported PDF', 'success'); setShowExportMenu(false);
  }

  function handlePrintLedger() {
    setShowExportMenu(false);
    window.setTimeout(() => openPrintPreview(`Fee Ledger - Term ${ledgerTerm} ${ledgerYear}`), 50);
  }

  const paymentExpectedFields = [
    { key: 'studentName', label: 'Student Name', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'method', label: 'Method', required: false },
    { key: 'date', label: 'Date', required: true },
  ];

  function downloadTemplate() {
    import('xlsx').then(({ utils, writeFile }) => {
      const ws = utils.aoa_to_sheet([
        ['Student Name', 'Amount', 'Method', 'Date'],
        ['John Doe', '50000', 'cash', '2024-01-15'],
      ]);
      ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Payments');
      writeFile(wb, 'payments-template.xlsx');
      addToast('Template downloaded', 'success');
    });
  }

  function closeImportModal() {
    setShowImportModal(false); setImportStep('upload');
    setCsvHeaders([]); setCsvData([]); setFieldMapping({}); setImportPreview([]);
    setDuplicateImportRows(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = []; let cur = ''; let inQ = false;
    for (const ch of line) { if (ch === '"') inQ = !inQ; else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; } else cur += ch; }
    result.push(cur.trim()); return result;
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
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
      setCsvHeaders(headers); setCsvData(data);
      const norm = (s: string) => s.toLowerCase().replace(/[\s_()\-\/]/g, '').replace(/[^a-z0-9]/g, '');
      const camelWords = (s: string) => s.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/[\s_\-]/g, '');
      const auto: Record<string, string> = {};
      paymentExpectedFields.forEach(f => {
        const nKey = norm(f.key); const nLabel = norm(f.label); const nCamel = camelWords(f.key);
        const h = headers.find(h => { const nH = norm(h); return nH === nKey || nH === nLabel || nH === nCamel || nH.includes(nKey) || nKey.includes(nH) || nH.includes(nLabel) || nLabel.includes(nH); });
        if (h) auto[f.key] = h;
      });
      setFieldMapping(auto); setImportStep('map'); setShowImportModal(true);
    } catch { addToast('Failed to read Excel file', 'error'); }
    e.target.value = '';
  }

  function processMapping() {
    const mapped = csvData.map(row => {
      const rec: any = {};
      paymentExpectedFields.forEach(f => { const h = fieldMapping[f.key]; if (h) { const i = csvHeaders.indexOf(h); if (i !== -1) rec[f.key] = row[i]; } });
      return rec;
    }).filter(r => r.studentName && r.amount);
    const duplicateRows = new Set<number>();
    const seen = new Set<string>();
    mapped.forEach((record, index) => {
      const student = students.find(x => matchesStudentSearch(x, record.studentName));
      const normalizedDate = normalizeImportDate(record.date);
      const normalizedMethod = String(record.method || PaymentMethod.CASH).toLowerCase();
      const key = `${student?.id || record.studentName}|${Number(record.amount || 0)}|${normalizedDate}|${normalizedMethod}`;
      if (seen.has(key)) duplicateRows.add(index);
      seen.add(key);
      if (student) {
        const existing = (payments as Payment[]).some(payment =>
          payment.studentId === student.id &&
          Number(payment.amount || 0) === Number(record.amount || 0) &&
          String(payment.method || '').toLowerCase() === normalizedMethod &&
          (!normalizedDate || normalizeImportDate(payment.date) === normalizedDate)
        );
        if (existing) duplicateRows.add(index);
      }
    });
    setDuplicateImportRows(duplicateRows);
    setImportPreview(mapped); setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (!importPreview.length || !id) { addToast('No valid records', 'error'); return; }
    if (importPreview.length - duplicateImportRows.size <= 0) {
      addToast('All rows are duplicates. Nothing to import.', 'warning');
      return;
    }
    setIsImporting(true);
    try {
      const now = new Date().toISOString();
      let importedCount = 0;
      let skippedCount = 0;
      const tasks = importPreview
        .map((d, i) => ({ d, i }))
        .filter(({ i }) => !duplicateImportRows.has(i))
        .map(({ d }) => async () => {
        const s = students.find(x => matchesStudentSearch(x, d.studentName));
        if (!s) {
          skippedCount++;
          return;
        }
        await dataService.create(id, 'payments', { id: uuidv4(), feeId: '', studentId: s.id, amount: parseFloat(d.amount), method: (d.method as PaymentMethod) || PaymentMethod.CASH, date: d.date || now, createdAt: now } as any);
        importedCount++;
      });
      await runTasksInThirtyPercentBatches(tasks);
      setIsImporting(false);
      closeImportModal();
      addToast(`${importedCount} payment${importedCount === 1 ? '' : 's'} imported${skippedCount ? `, ${skippedCount} skipped because no student matched` : ''}`, skippedCount ? 'warning' : 'success');
      setShowImportSuccess(true);
    } catch {
      setIsImporting(false);
      addToast('Import failed', 'error');
    }
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setShowExportMenu(false);
      if (termFilterRef.current && !termFilterRef.current.contains(e.target as Node)) setShowTermFilter(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // -- Derived data ------------------------------------------------------------
  const feeRows = fees as Fee[];
  const paymentRows = payments as Payment[];
  const totalCollected = useMemo(() => paymentRows.reduce((s, p) => s + Number(p.amount || 0), 0), [paymentRows]);
  const totalInvoiced = useMemo(() => feeRows.reduce((s, f) => s + Number(f.amount || 0), 0), [feeRows]);
  const feesByStudent = useMemo(() => {
    const map = new Map<string, Fee[]>();
    feeRows.forEach(fee => {
      if (!fee.studentId) return;
      const list = map.get(fee.studentId) || [];
      list.push(fee);
      map.set(fee.studentId, list);
    });
    return map;
  }, [feeRows]);
  const paymentsByFee = useMemo(() => {
    const map = new Map<string, Payment[]>();
    paymentRows.forEach(payment => {
      if (!payment.feeId) return;
      const list = map.get(payment.feeId) || [];
      list.push(payment);
      map.set(payment.feeId, list);
    });
    return map;
  }, [paymentRows]);
  const paymentsByStudentId = useMemo(() => {
    const map = new Map<string, Payment[]>();
    paymentRows.forEach(payment => {
      if (!payment.studentId) return;
      const list = map.get(payment.studentId) || [];
      list.push(payment);
      map.set(payment.studentId, list);
    });
    return map;
  }, [paymentRows]);
  const termOptions = useMemo(() => {
    const values = Array.from(new Set([settingsMap.currentTerm || '1', ...feeRows.map(f => f.term)]
      .map(value => String(value || '').trim())
      .filter(Boolean)));
    return values.sort((a, b) => termRank(a) - termRank(b) || a.localeCompare(b));
  }, [feeRows, settingsMap.currentTerm]);
  const yearOptions = useMemo(() => {
    const values = Array.from(new Set([settingsMap.academicYear || String(new Date().getFullYear()), ...feeRows.map(f => f.year)]
      .map(value => String(value || '').trim())
      .filter(Boolean)));
    return values.sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
  }, [feeRows, settingsMap.academicYear]);
  const ledgerTerm = String(filterTerm === 'all' ? (settingsMap.currentTerm || termOptions[termOptions.length - 1] || String(new Date().getMonth() < 4 ? 1 : new Date().getMonth() < 8 ? 2 : 3)) : filterTerm);
  const ledgerYear = String(filterYear === 'all' ? (settingsMap.academicYear || yearOptions[0] || String(new Date().getFullYear())) : filterYear);
  const bursaryByStudent = useMemo(() => {
    const map = new Map<string, { amount: number; isFull: boolean; count: number }>();
    (bursariesData as any[]).forEach((b: any) => {
      if (String(b.term) !== String(ledgerTerm) || String(b.year) !== String(ledgerYear)) return;
      const current = map.get(b.studentId) || { amount: 0, isFull: false, count: 0 };
      map.set(b.studentId, { amount: current.amount + Number(b.amount || 0), isFull: current.isFull || Boolean(b.isFull), count: current.count + 1 });
    });
    return map;
  }, [bursariesData, ledgerTerm, ledgerYear]);
  const discountByStudent = useMemo(() => {
    const map = new Map<string, { amount: number; percentage: number; count: number }>();
    (discountsData as any[]).forEach((d: any) => {
      if (!d.studentId) return;
      if (String(d.term) !== String(ledgerTerm) || String(d.year) !== String(ledgerYear)) return;
      const current = map.get(d.studentId) || { amount: 0, percentage: 0, count: 0 };
      map.set(d.studentId, {
        amount: current.amount + (d.type === 'percentage' ? 0 : Number(d.amount || 0)),
        percentage: current.percentage + (d.type === 'percentage' ? Number(d.amount || 0) : 0),
        count: current.count + 1,
      });
    });
    return map;
  }, [discountsData, ledgerTerm, ledgerYear]);
  const studentsOnBursary = students.filter(s => bursaryByStudent.has(s.id)).length;
  const studentsWithDiscount = students.filter(s => discountByStudent.has(s.id)).length;

  const formatDiscountTag = (discount?: { amount: number; percentage: number; count: number }) => {
    if (!discount) return '';
    if (discount.percentage > 0 && discount.amount > 0) return `${discount.percentage}% + ${formatMoney(discount.amount)}`;
    if (discount.percentage > 0) return `${discount.percentage}%`;
    return formatMoney(discount.amount);
  };

  const renderFinanceTags = (bursary?: { amount: number; isFull: boolean; count: number }, discount?: { amount: number; percentage: number; count: number }) => {
    if (!bursary && !discount) return <span className="text-slate-400 text-sm">-</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {bursary?.isFull && <span className="badge badge-success text-[10px]">Full bursary</span>}
        {bursary && !bursary.isFull && <span className="badge badge-warning text-[10px]">Bursary {formatMoney(bursary.amount)}</span>}
        {discount && <span className="badge badge-info text-[10px]">Discount {formatDiscountTag(discount)}</span>}
      </div>
    );
  };

  const getPayableAmount = (
    amount: number,
    bursary?: { amount: number; isFull: boolean; count: number },
    discount?: { amount: number; percentage: number; count: number }
  ) => {
    if (bursary?.isFull) return 0;
    const percent = Math.min(100, Math.max(0, discount?.percentage || 0));
    const afterPercent = Math.max(0, amount - (amount * percent) / 100);
    return Math.max(0, afterPercent - (discount?.amount || 0) - (bursary?.amount || 0));
  };

  const getStudentTermBreakdown = (studentId: string) => {
    const studentFees = feesByStudent.get(studentId) || [];
    const previousFees = studentFees.filter(f => isBeforeTerm(f, ledgerTerm, ledgerYear));
    const currentFees = studentFees.filter(f => String(f.term) === String(ledgerTerm) && String(f.year) === String(ledgerYear));
    const previousFeeIds = new Set(previousFees.map(f => f.id));
    const currentFeeIds = new Set(currentFees.map(f => f.id));
    const previousInvoiced = previousFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const previousPaid = previousFees
      .flatMap(f => paymentsByFee.get(f.id) || [])
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const currentInvoiced = currentFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const currentPaid = currentFees
      .flatMap(f => paymentsByFee.get(f.id) || [])
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const bursary = bursaryByStudent.get(studentId);
    const discount = discountByStudent.get(studentId);
    const hasFullBursary = Boolean(bursary?.isFull);
    const openingPayable = previousInvoiced;
    const currentPayable = getPayableAmount(currentInvoiced, bursary, discount);
    const openingBalance = Math.max(0, openingPayable - previousPaid);
    const openingCredit = Math.max(0, previousPaid - openingPayable);
    const effectiveCurrentPaid = hasFullBursary ? Math.max(currentPaid, currentInvoiced) : currentPaid;
    const closingBalance = Math.max(0, openingBalance + currentPayable - currentPaid - openingCredit);
    const upfrontCredit = hasFullBursary ? 0 : Math.max(0, openingCredit + currentPaid - currentPayable);
    return {
      previousFees,
      currentFees,
      previousInvoiced,
      previousPaid,
      currentInvoiced,
      currentPayable,
      currentPaid,
      effectiveCurrentPaid,
      openingBalance,
      closingBalance,
      upfrontCredit,
      bursary,
      discount,
      hasFullBursary,
    };
  };

  const studentFinanceSummary = useMemo(() => students.map(student => {
    const breakdown = getStudentTermBreakdown(student.id);
    const hasActivity = breakdown.currentFees.length > 0 || breakdown.openingBalance > 0 || breakdown.currentPaid > 0;
    return {
      id: student.id,
      studentName: `${student.firstName} ${student.lastName}`,
      studentId: student.studentId,
      totalInvoiced: breakdown.currentInvoiced,
      openingBalance: breakdown.openingBalance,
      payable: breakdown.currentPayable,
      totalPaid: breakdown.effectiveCurrentPaid,
      actualPaid: breakdown.currentPaid,
      balance: breakdown.closingBalance,
      upfrontCredit: breakdown.upfrontCredit,
      invoiceCount: breakdown.currentFees.length,
      isCleared: hasActivity && (breakdown.hasFullBursary || breakdown.closingBalance <= 0),
      hasCurrentInvoice: breakdown.currentFees.length > 0,
      bursary: breakdown.bursary,
      discount: breakdown.discount,
      hasFullBursary: breakdown.hasFullBursary,
    };
  }).filter(s => s.invoiceCount > 0 || s.openingBalance > 0 || s.totalPaid > 0), [students, feesByStudent, paymentsByFee, bursaryByStudent, discountByStudent, ledgerTerm, ledgerYear]);

  const totalPending = useMemo(() => studentFinanceSummary.reduce((sum, s) => sum + s.balance, 0), [studentFinanceSummary]);

  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);

  const filteredStudentFinance = useMemo(() => studentFinanceSummary.filter(s => {
    const student = studentById.get(s.id);
    return !student || matchesStudentSearch(student, deferredSearchTerm);
  }), [studentFinanceSummary, studentById, deferredSearchTerm]);

  // Group fees by student for Invoices tab
  const invoicesByStudent = useMemo(() => students.map(student => {
    const breakdown = getStudentTermBreakdown(student.id);
    const sf = breakdown.currentFees.filter(f => matchesStudentSearch(student, deferredSearchTerm) || matchesTextSearch([f.description, f.term, f.year], deferredSearchTerm));
    const matchStudent = matchesStudentSearch(student, deferredSearchTerm);
    if (sf.length === 0 && !breakdown.openingBalance && !matchStudent) return null;
    if (sf.length === 0 && breakdown.openingBalance <= 0) return null;
    return {
      student,
      fees: sf,
      openingBalance: breakdown.openingBalance,
      totalInv: breakdown.currentInvoiced,
      payable: breakdown.currentPayable,
      totalPaid: breakdown.effectiveCurrentPaid,
      actualPaid: breakdown.currentPaid,
      balance: breakdown.closingBalance,
      upfrontCredit: breakdown.upfrontCredit,
      bursary: breakdown.bursary,
      discount: breakdown.discount,
      hasFullBursary: breakdown.hasFullBursary,
      hasCurrentInvoice: breakdown.currentFees.length > 0,
    };
  }).filter(Boolean) as { student: any; fees: Fee[]; openingBalance: number; totalInv: number; payable: number; totalPaid: number; actualPaid: number; balance: number; upfrontCredit: number; bursary?: { amount: number; isFull: boolean; count: number }; discount?: { amount: number; percentage: number; count: number }; hasFullBursary: boolean; hasCurrentInvoice: boolean }[], [students, deferredSearchTerm, feesByStudent, paymentsByFee, bursaryByStudent, discountByStudent, ledgerTerm, ledgerYear]);

  // Group payments by student for Payments tab
  const paymentsByStudent = useMemo(() => students.map(student => {
    const sp = (paymentsByStudentId.get(student.id) || []).filter(p => {
      const matchSearch = matchesStudentSearch(student, deferredSearchTerm) || matchesTextSearch([p.method, (p as any).reference, (p as any).notes, p.date], deferredSearchTerm);
      return matchSearch;
    });
    if (sp.length === 0) return null;
    const total = sp.reduce((a, p) => a + p.amount, 0);
    const sorted = [...sp].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { student, payments: sorted, total };
  }).filter(Boolean) as { student: any; payments: Payment[]; total: number }[], [students, paymentsByStudentId, deferredSearchTerm]);

  const ledgerRows = useMemo(() => {
    return students.map(student => {
      const studentFees = feesByStudent.get(student.id) || [];
      const previousFees = studentFees.filter(f => isBeforeTerm(f, ledgerTerm, ledgerYear));
      const currentFees = studentFees.filter(f => String(f.term) === String(ledgerTerm) && String(f.year) === String(ledgerYear));
      const previousFeeIds = new Set(previousFees.map(f => f.id));
      const currentFeeIds = new Set(currentFees.map(f => f.id));
      const openingInvoiced = previousFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const openingPaid = previousFees
        .flatMap(f => paymentsByFee.get(f.id) || [])
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const invoiced = currentFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const paid = currentFees
        .flatMap(f => paymentsByFee.get(f.id) || [])
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const bursary = bursaryByStudent.get(student.id);
      const discount = discountByStudent.get(student.id);
      const hasFullBursary = Boolean(bursary?.isFull);
      const adjustments = (bursary?.amount || 0) + (discount?.amount || 0);
      const openingPayable = openingInvoiced;
      const currentPayable = getPayableAmount(invoiced, bursary, discount);
      const openingBalance = Math.max(0, openingPayable - openingPaid);
      const openingCredit = Math.max(0, openingPaid - openingPayable);
      const effectivePaid = hasFullBursary ? Math.max(paid, invoiced) : paid;
      const closingBalance = Math.max(0, openingBalance + currentPayable - paid - openingCredit);
      const upfrontCredit = hasFullBursary ? 0 : Math.max(0, openingCredit + paid - currentPayable);
      const lastFee = [...studentFees].sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())[0];
      return {
        student,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo || student.studentId || '',
        openingBalance,
        invoiced,
        payable: currentPayable,
        paid: effectivePaid,
        adjustments,
        closingBalance,
        upfrontCredit,
        invoiceCount: currentFees.length,
        lastActivity: lastFee?.createdAt || '',
        bursary,
        discount,
        hasFullBursary,
      };
    }).filter(row => {
      const matchesSearch = matchesStudentSearch(row.student, deferredSearchTerm);
      const hasLedgerActivity = row.openingBalance > 0 || row.invoiced > 0 || row.paid > 0 || row.closingBalance > 0;
      return matchesSearch && hasLedgerActivity;
    });
  }, [students, feesByStudent, paymentsByFee, ledgerTerm, ledgerYear, bursaryByStudent, discountByStudent, deferredSearchTerm]);

  const ledgerTotals = useMemo(() => ledgerRows.reduce((acc, row) => ({
    openingBalance: acc.openingBalance + row.openingBalance,
    invoiced: acc.invoiced + row.invoiced,
    paid: acc.paid + row.paid,
    closingBalance: acc.closingBalance + row.closingBalance,
    upfrontCredit: acc.upfrontCredit + row.upfrontCredit,
  }), { openingBalance: 0, invoiced: 0, paid: 0, closingBalance: 0, upfrontCredit: 0 }), [ledgerRows]);

  const selectedLedgerRow = selectedLedgerStudentId ? ledgerRows.find(row => row.student.id === selectedLedgerStudentId) : null;
  const selectedLedgerPreviousFees = selectedLedgerStudentId
    ? (fees as Fee[])
        .filter(f => f.studentId === selectedLedgerStudentId && isBeforeTerm(f, ledgerTerm, ledgerYear))
        .sort((a, b) => Number(a.year || 0) - Number(b.year || 0) || termRank(a.term) - termRank(b.term))
    : [];
  const selectedLedgerCurrentFees = selectedLedgerStudentId
    ? (fees as Fee[])
        .filter(f => f.studentId === selectedLedgerStudentId && String(f.term) === String(ledgerTerm) && String(f.year) === String(ledgerYear))
        .sort((a, b) => new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime())
    : [];
  const selectedLedgerFees = [...selectedLedgerPreviousFees, ...selectedLedgerCurrentFees];
  const selectedLedgerPayments = selectedLedgerStudentId
    ? (paymentsByStudentId.get(selectedLedgerStudentId) || paymentRows)
        .filter(p => p.studentId === selectedLedgerStudentId || selectedLedgerFees.some(f => f.id === p.feeId))
        .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime())
    : [];
  const studentFinanceProgress = useProgressiveList(filteredStudentFinance, { initialCount: 120, step: 120, delayMs: 2000 });
  const ledgerProgress = useProgressiveList(ledgerRows, { initialCount: 120, step: 120, delayMs: 2000 });
  const invoiceProgress = useProgressiveList(invoicesByStudent, { initialCount: 80, step: 80, delayMs: 2000 });
  const paymentProgress = useProgressiveList(paymentsByStudent, { initialCount: 80, step: 80, delayMs: 2000 });
  const visibleFilteredStudentFinance = studentFinanceProgress.visibleItems;
  const visibleLedgerRows = ledgerProgress.visibleItems;
  const visibleInvoicesByStudent = invoiceProgress.visibleItems;
  const visiblePaymentsByStudent = paymentProgress.visibleItems;

  const tabs = [
    { id: 'students', label: 'Students', icon: Users },
    { id: 'ledger', label: 'Ledger', icon: FileText },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'payments', label: 'Payments', icon: Receipt },
    { id: 'accounts', label: 'Accounts', icon: Building2 },
  ];

  const renderSchoolPrintHeader = (documentTitle: string) => (
    <div className="mb-5 border-b border-slate-300 pb-4 text-slate-900 print:block">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {(ledgerTemplate.logo || schoolPrintInfo.logo) && (
            <img src={ledgerTemplate.logo || schoolPrintInfo.logo} alt="School logo" className="h-16 w-16 shrink-0 object-contain" />
          )}
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight" style={{ color: ledgerTemplate.headerColor }}>{schoolPrintInfo.name}</h2>
            {schoolPrintInfo.address && <p className="text-sm text-slate-600">{schoolPrintInfo.address}</p>}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {schoolPrintInfo.phone && <span>Tel: {schoolPrintInfo.phone}</span>}
              {schoolPrintInfo.email && <span>Email: {schoolPrintInfo.email}</span>}
            </div>
          </div>
        </div>
        <div className="text-left text-sm sm:text-right">
          <p className="font-bold uppercase tracking-wide" style={{ color: ledgerTemplate.headerColor }}>
            {editableLedgerText(documentTitle.startsWith('Fee Ledger') ? 'print.feeLedgerTitle' : 'print.studentLedgerTitle', documentTitle)}
          </p>
          <p className="text-slate-500">{editableLedgerText('print.printedLabel', 'Printed')} {new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Finance Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track fees, invoices, and payments</p>
        </div>
        <div className="flex items-center gap-2">
          {!selectedLedgerRow && (activeTab === 'ledger' || activeTab === 'invoices' || activeTab === 'payments') && (
            <div className="relative" ref={exportMenuRef}>
              <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-secondary">
                <Download size={16} /><span className="hidden sm:inline">Export</span>
                <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-[9999] overflow-hidden">
                  {activeTab === 'invoices' && <>
                    <button onClick={handleExportInvoicesCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} />Export CSV</button>
                    <button onClick={handleExportInvoicesExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export Excel</button>
                  </>}
                  {activeTab === 'payments' && <>
                    <button onClick={handleExportPaymentsCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} />Export CSV</button>
                    <button onClick={handleExportPaymentsExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export Excel</button>
                  </>}
                  {activeTab === 'ledger' && <>
                    <button onClick={handleExportLedgerCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} />Export CSV</button>
                    <button onClick={handleExportLedgerExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export Excel</button>
                    <button onClick={handleExportLedgerPDF} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export PDF</button>
                    <button onClick={handlePrintLedger} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Printer size={14} />Print Ledger</button>
                  </>}
                </div>
              )}
            </div>
          )}
          {!selectedLedgerRow && activeTab === 'payments' && (
            <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
              <Upload size={16} /><span className="hidden sm:inline">Import</span>
            </button>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx,.xls" className="hidden" />
        </div>
      </div>

      {/* Stats */}
      {activeTab === 'students' && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Receipt size={24} className="text-white" /></div>
            <div className="min-w-0"><p className="text-sm font-medium text-white/80">Collected</p><FitStatValue>{formatMoney(totalCollected)}</FitStatValue></div>
          </div>
        </div>
        <div className="card-solid-rose p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><DollarSign size={24} className="text-white" /></div>
            <div className="min-w-0"><p className="text-sm font-medium text-white/80">Pending</p><FitStatValue>{formatMoney(totalPending)}</FitStatValue></div>
          </div>
        </div>
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><FileText size={24} className="text-white" /></div>
            <div className="min-w-0"><p className="text-sm font-medium text-white/80">Invoiced</p><FitStatValue>{formatMoney(totalInvoiced)}</FitStatValue></div>
          </div>
        </div>
        <div className="card-solid-violet p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Receipt size={24} className="text-white" /></div>
            <div className="min-w-0"><p className="text-sm font-medium text-white/80">Transactions</p><FitStatValue>{payments.length}</FitStatValue></div>
          </div>
        </div>
        <div className="card-solid-amber p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Award size={24} className="text-white" /></div>
            <div className="min-w-0"><p className="text-sm font-medium text-white/80">On Bursary</p><FitStatValue>{studentsOnBursary}</FitStatValue></div>
          </div>
        </div>
        <div className="card-solid-cyan p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Percent size={24} className="text-white" /></div>
            <div className="min-w-0"><p className="text-sm font-medium text-white/80">With Discount</p><FitStatValue>{studentsWithDiscount}</FitStatValue></div>
          </div>
        </div>
      </div>}

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">{activeTab === 'ledger' ? `Term ${ledgerTerm} ${ledgerYear}` : 'Finance'}</p>
          <h2 className="mt-0.5 text-xl font-bold text-slate-800 dark:text-white">
            {selectedLedgerRow ? selectedLedgerRow.studentName : tabs.find(tab => tab.id === activeTab)?.label || 'Students'}
          </h2>
          {selectedLedgerRow && <p className="mt-0.5 text-sm text-slate-500">{selectedLedgerRow.admissionNo || 'No ID'}</p>}
        </div>
      </div>

      {/* Finance pages */}
      <div className={activeTab === 'students' ? 'card' : 'space-y-3'}>
        <div className={activeTab === 'students' ? 'card-header' : ''}>
          <div className={`flex gap-2 items-center justify-between ${activeTab === 'ledger' && !selectedLedgerRow ? 'flex-nowrap' : 'flex-wrap'}`}>
            <div className={`flex gap-2 ${activeTab === 'ledger' && !selectedLedgerRow ? 'flex-nowrap overflow-x-auto' : 'flex-wrap'}`}>
              {selectedLedgerRow ? (
                <button onClick={() => setSelectedLedgerStudentId(null)} className="btn btn-secondary">
                  <ArrowRight size={16} className="rotate-180" /> Back to Ledger
                </button>
              ) : tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                  <tab.icon size={16} />{tab.label}
                </button>
              ))}
            </div>
            <div className={`flex items-center gap-2 shrink-0 ${activeTab === 'ledger' && !selectedLedgerRow ? 'flex-nowrap' : 'flex-wrap'}`}>
              {!selectedLedgerRow && (activeTab === 'ledger' || activeTab === 'invoices') && (
                <div className="relative" ref={termFilterRef}>
                  <button onClick={() => setShowTermFilter(!showTermFilter)}
                    className="btn btn-secondary flex items-center gap-2">
                    <Filter size={16} />
                    <span className="hidden sm:inline">{activeTab === 'ledger' ? `Term ${ledgerTerm}` : filterTerm === 'all' ? 'All Terms' : `Term ${filterTerm}`}</span>
                    <ChevronDown size={14} className={`transition-transform ${showTermFilter ? 'rotate-180' : ''}`} />
                  </button>
                  {showTermFilter && (
                    <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-[9999] overflow-hidden">
                      {(activeTab === 'ledger' ? (termOptions.length ? termOptions : ['1', '2', '3']) : ['all', '1', '2', '3']).map(t => (
                        <button key={t} onClick={() => { setFilterTerm(t); setShowTermFilter(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${(activeTab === 'ledger' ? ledgerTerm === t : filterTerm === t) ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                          {t === 'all' ? 'All Terms' : `Term ${t}`}
                          {(activeTab === 'ledger' ? ledgerTerm === t : filterTerm === t) && <Check size={14} className="ml-auto" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!selectedLedgerRow && activeTab === 'ledger' && (
                <select
                  value={filterYear}
                  onChange={e => setFilterYear(e.target.value)}
                  className="form-input form-select relative z-[70] w-28 py-2 text-sm"
                >
                  {(yearOptions.length ? yearOptions : [String(new Date().getFullYear())]).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              )}
          {activeTab === 'ledger' && (
            <button onClick={handlePrintLedger} className="btn btn-secondary">
              <Printer size={16} /> Print
            </button>
          )}
          {activeTab === 'ledger' && (
            <button onClick={() => setIsLedgerLiveEditing(prev => !prev)} className={`btn flex items-center gap-2 ${isLedgerLiveEditing ? 'bg-yellow-500 text-white hover:bg-yellow-600' : 'btn-secondary'}`}>
              {isLedgerLiveEditing ? <Check size={16} /> : <Palette size={16} />}
              {isLedgerLiveEditing ? 'Finish Editing' : 'Live Edit'}
            </button>
          )}
              {!selectedLedgerRow && <div className="relative shrink-0">
                <Search size={18} className="search-input-icon" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="search-input w-48" />
              </div>}
            </div>
          </div>
        </div>

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="table-container">
            <table>
              <thead><tr><th>No.</th><th>Student</th><th>ID Number</th><th>Invoices</th><th>Tags</th><th>Last Term</th><th>Current Invoiced</th><th>Payable</th><th>Total Paid</th><th>Upfront Credit</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {filteredStudentFinance.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center"><Users size={24} className="text-violet-400" /></div>
                      <p className="text-slate-500 font-medium">No invoiced students</p>
                    </div>
                  </td></tr>
                ) : visibleFilteredStudentFinance.map((s, index) => (
                  <tr key={s.id}>
                    <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                    <td className="font-medium">{s.studentName}</td>
                    <td className="text-slate-500">{s.studentId}</td>
                    <td><span className="badge badge-info">{s.invoiceCount}</span></td>
                    <td>{renderFinanceTags(s.bursary, s.discount)}</td>
                    <td>{s.openingBalance > 0 ? <span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">Last term {formatMoney(s.openingBalance)}</span> : <span className="text-slate-400 text-sm">-</span>}</td>
                    <td className="font-semibold">{formatMoney(s.totalInvoiced)}</td>
                    <td className="font-semibold text-indigo-600 dark:text-indigo-300">{formatMoney(s.payable)}</td>
                    <td className="text-emerald-600 font-semibold">{formatMoney(s.totalPaid)}</td>
                    <td>{s.upfrontCredit > 0 ? <span className="badge badge-success">{formatMoney(s.upfrontCredit)}</span> : <span className="text-slate-400 text-sm">-</span>}</td>
                    <td className={s.balance > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{formatMoney(s.balance)}</td>
                    <td>{!s.hasCurrentInvoice && s.openingBalance > 0 ? <span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">Last term balance</span> : s.hasFullBursary ? <span className="badge badge-success">Paid</span> : s.isCleared ? <span className="badge badge-success">Cleared</span> : s.balance > 0 ? <span className="badge badge-danger">Balance: {formatMoney(s.balance)}</span> : <span className="badge badge-warning">No Invoice</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ProgressiveListLoader hasMore={studentFinanceProgress.hasMore} loadingMore={studentFinanceProgress.loadingMore} onVisible={studentFinanceProgress.loadMore} />
          </div>
        )}

        {/* Ledger Tab - term statement with opening and closing balance */}
        {activeTab === 'ledger' && (
          <div className="space-y-3 print-area">
            <div className={`grid gap-4 print:block ${isLedgerLiveEditing ? 'lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}`}>
              {isLedgerLiveEditing && (
                <aside className="print:hidden h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:sticky lg:top-20">
                  <div className="mb-3 flex items-center gap-2">
                    <Palette size={16} className="text-indigo-600" />
                    <h3 className="text-sm font-black text-slate-800 dark:text-white">Ledger Tools</h3>
                  </div>
                  <div className="space-y-3">
                    {[
                      ['Text', ledgerTemplate.textColor, (value: string) => updateLedgerTemplate({ textColor: value })],
                      ['Header', ledgerTemplate.headerColor, (value: string) => updateLedgerTemplate({ headerColor: value })],
                      ['Accent', ledgerTemplate.accentColor, (value: string) => updateLedgerTemplate({ accentColor: value })],
                    ].map(([label, value, onChange]: any) => (
                      <div key={label}>
                        <label className="mb-1 block text-xs font-bold text-slate-500">{label}</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-9 w-10 rounded border border-slate-200" />
                          <input value={value} onChange={e => onChange(e.target.value)} className="form-input h-9 min-h-0 flex-1 px-2 py-1 font-mono text-xs" />
                        </div>
                      </div>
                    ))}
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-500">Logo</label>
                      <div className="flex gap-2">
                        <input value={ledgerTemplate.logo || schoolPrintInfo.logo || ''} onChange={e => updateLedgerTemplate({ logo: e.target.value })} className="form-input h-9 min-h-0 flex-1 px-2 py-1 text-xs" placeholder="Image URL" />
                        <button type="button" onClick={() => ledgerLogoInputRef.current?.click()} className="rounded-lg border border-slate-200 px-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700" title="Upload logo">
                          <Upload size={15} />
                        </button>
                      </div>
                      <input ref={ledgerLogoInputRef} type="file" accept="image/*" onChange={handleLedgerLogoUpload} className="hidden" />
                    </div>
                  </div>
                </aside>
              )}
              <div style={{ color: ledgerTemplate.textColor }}>
            {selectedLedgerRow ? (
              <div className="mx-auto max-w-5xl rounded-sm border border-slate-200 bg-white p-6 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none">
                {renderSchoolPrintHeader('Student Ledger Statement')}
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-slate-700">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">{editableLedgerText('student.statementTitle', 'Student Ledger Statement')}</p>
                    <h3 className="mt-1 text-2xl font-bold">{selectedLedgerRow.studentName}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{editableLedgerText('student.idLabel', 'ID')}: {selectedLedgerRow.admissionNo || '-'} | {editableLedgerText('student.termLabel', 'Term')} {ledgerTerm}, {ledgerYear}</p>
                  </div>
                  <div className="text-left text-sm sm:text-right">
                    <p className="font-semibold">{schoolPrintInfo.name}</p>
                    <p className="text-slate-500 dark:text-slate-400">{editableLedgerText('print.printedLabel', 'Printed')} {new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 sm:grid-cols-5">
                  {[
                    { key: 'summary.openingBalance', label: 'Opening Balance', value: selectedLedgerRow.openingBalance, color: selectedLedgerRow.openingBalance > 0 ? 'text-pink-600' : 'text-slate-700 dark:text-slate-200' },
                    { key: 'summary.currentInvoiced', label: 'Current Invoiced', value: selectedLedgerRow.invoiced, color: 'text-indigo-600 dark:text-indigo-300' },
                    { key: 'summary.currentPaid', label: 'Current Paid', value: selectedLedgerRow.paid, color: 'text-emerald-600 dark:text-emerald-300' },
                    { key: 'summary.closingBalance', label: 'Closing Balance', value: selectedLedgerRow.closingBalance, color: selectedLedgerRow.closingBalance > 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300' },
                    { key: 'summary.upfrontCredit', label: 'Upfront Credit', value: selectedLedgerRow.upfrontCredit, color: 'text-emerald-600 dark:text-emerald-300' },
                  ].map(item => (
                    <div key={item.label} className="bg-white p-3 dark:bg-slate-900 print:bg-white">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{editableLedgerText(item.key, item.label)}</p>
                      <p className={`mt-1 text-lg font-bold tabular-nums ${item.color}`}>{formatMoney(item.value)}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 space-y-6">
                  <section>
                    <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-pink-600 dark:text-pink-300">{editableLedgerText('section.previousTerm', 'Previous Term Balance Details')}</h4>
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                          <tr><th>{editableLedgerText('table.no', 'No.')}</th><th>{editableLedgerText('table.description', 'Description')}</th><th>{editableLedgerText('table.term', 'Term')}</th><th className="text-right">{editableLedgerText('table.amount', 'Amount')}</th><th className="text-right">{editableLedgerText('table.paid', 'Paid')}</th><th className="text-right">{editableLedgerText('table.balance', 'Balance')}</th></tr>
                        </thead>
                        <tbody>
                          {selectedLedgerPreviousFees.length === 0 ? (
                            <tr><td colSpan={6} className="py-6 text-center text-slate-500">{editableLedgerText('empty.noPrevious', 'No previous term balance.')}</td></tr>
                          ) : selectedLedgerPreviousFees.map((fee, index) => {
                            const paid = selectedLedgerPayments.filter(p => p.feeId === fee.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                            const balance = Math.max(0, Number(fee.amount || 0) - paid);
                            return (
                              <tr key={fee.id}>
                                <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                                <td className="font-medium">{fee.description}</td>
                                <td>Term {fee.term}, {fee.year}</td>
                                <td className="text-right font-semibold tabular-nums">{formatMoney(fee.amount)}</td>
                                <td className="text-right tabular-nums text-emerald-600">{formatMoney(paid)}</td>
                                <td className="text-right font-semibold tabular-nums text-pink-600 dark:text-pink-300">{formatMoney(balance)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{editableLedgerText('section.currentTerm', 'Current Term Fees List')}</h4>
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                          <tr><th>{editableLedgerText('table.no', 'No.')}</th><th>{editableLedgerText('table.fee', 'Fee')}</th><th>{editableLedgerText('table.term', 'Term')}</th><th className="text-right">{editableLedgerText('table.amount', 'Amount')}</th><th className="text-right">{editableLedgerText('table.paid', 'Paid')}</th><th className="text-right">{editableLedgerText('table.balance', 'Balance')}</th></tr>
                        </thead>
                        <tbody>
                          {selectedLedgerCurrentFees.length === 0 ? (
                            <tr><td colSpan={6} className="py-6 text-center text-slate-500">{editableLedgerText('empty.noCurrentFees', 'No current term fees yet.')}</td></tr>
                          ) : selectedLedgerCurrentFees.map((fee, index) => {
                            const paid = selectedLedgerPayments.filter(p => p.feeId === fee.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
                            const balance = Math.max(0, Number(fee.amount || 0) - paid);
                            return (
                              <tr key={fee.id}>
                                <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                                <td className="font-medium">{fee.description}</td>
                                <td>Term {fee.term}, {fee.year}</td>
                                <td className="text-right font-semibold tabular-nums">{formatMoney(fee.amount)}</td>
                                <td className="text-right tabular-nums text-emerald-600">{formatMoney(paid)}</td>
                                <td className={`text-right font-semibold tabular-nums ${balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatMoney(balance)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{editableLedgerText('section.paymentActivity', 'Payment Activity')}</h4>
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                          <tr><th>{editableLedgerText('table.no', 'No.')}</th><th>{editableLedgerText('table.date', 'Date')}</th><th>{editableLedgerText('table.method', 'Method')}</th><th>{editableLedgerText('table.reference', 'Reference')}</th><th className="text-right">{editableLedgerText('table.amount', 'Amount')}</th></tr>
                        </thead>
                        <tbody>
                          {selectedLedgerPayments.length === 0 ? (
                            <tr><td colSpan={5} className="py-6 text-center text-slate-500">{editableLedgerText('empty.noPayments', 'No payment activity.')}</td></tr>
                          ) : selectedLedgerPayments.map((payment, index) => (
                            <tr key={payment.id}>
                              <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                              <td>{payment.date ? new Date(payment.date).toLocaleDateString() : '-'}</td>
                              <td className="capitalize">{payment.method?.replace('_', ' ') || 'payment'}</td>
                              <td>{payment.reference || '-'}</td>
                              <td className="text-right font-semibold tabular-nums text-emerald-600">{formatMoney(payment.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            ) : (
              <>
            <div className="hidden print:block">
              {renderSchoolPrintHeader(`Fee Ledger - Term ${ledgerTerm} ${ledgerYear}`)}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{editableLedgerText('summary.openingBalance', 'Opening Balance')}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(ledgerTotals.openingBalance)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{editableLedgerText('summary.invoiced', 'Invoiced')}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-indigo-600 dark:text-indigo-300">{formatMoney(ledgerTotals.invoiced)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{editableLedgerText('summary.paid', 'Paid')}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-300">{formatMoney(ledgerTotals.paid)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{editableLedgerText('summary.closingBalance', 'Closing Balance')}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${ledgerTotals.closingBalance > 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{formatMoney(ledgerTotals.closingBalance)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{editableLedgerText('summary.upfrontCredit', 'Upfront Credit')}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-300">{formatMoney(ledgerTotals.upfrontCredit)}</p>
              </div>
            </div>

            <div className="table-container mt-5">
              <table>
                <thead>
                  <tr>
                    <th>{editableLedgerText('table.no', 'No.')}</th>
                    <th>{editableLedgerText('table.student', 'Student')}</th>
                    <th>{editableLedgerText('table.idNumber', 'ID Number')}</th>
                    <th className="text-right">{editableLedgerText('summary.openingBalance', 'Opening Balance')}</th>
                    <th className="text-right">{editableLedgerText('summary.invoiced', 'Invoiced')}</th>
                    <th className="text-right">{editableLedgerText('table.payable', 'Payable')}</th>
                    <th className="text-right">{editableLedgerText('summary.paid', 'Paid')}</th>
                    <th className="text-right">{editableLedgerText('summary.closingBalance', 'Closing Balance')}</th>
                    <th className="text-right">{editableLedgerText('summary.upfrontCredit', 'Upfront Credit')}</th>
                    <th>{editableLedgerText('table.invoices', 'Invoices')}</th>
                    <th>{editableLedgerText('table.tags', 'Tags')}</th>
                    <th>{editableLedgerText('table.status', 'Status')}</th>
                    <th>{editableLedgerText('table.action', 'Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.length === 0 ? (
                    <tr><td colSpan={13} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center"><FileText size={24} className="text-indigo-400" /></div>
                        <p className="text-slate-500 font-medium">{editableLedgerText('empty.noLedgerActivity', 'No ledger activity for Term')} {ledgerTerm} {ledgerYear}</p>
                        <p className="text-sm text-slate-400">{editableLedgerText('empty.openingHint', 'Invoices from previous terms appear here as opening balances.')}</p>
                      </div>
                    </td></tr>
                  ) : visibleLedgerRows.map((row, index) => (
                    <tr key={row.student.id} onClick={() => setSelectedLedgerStudentId(row.student.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                      <td className="font-medium">{row.studentName}</td>
                      <td className="text-slate-500">{row.admissionNo || '-'}</td>
                      <td className={`text-right tabular-nums ${row.openingBalance > 0 ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>{formatMoney(row.openingBalance)}</td>
                      <td className="text-right tabular-nums font-semibold text-indigo-600 dark:text-indigo-300">{formatMoney(row.invoiced)}</td>
                      <td className="text-right tabular-nums font-semibold text-indigo-600 dark:text-indigo-300">{formatMoney(row.payable)}</td>
                      <td className="text-right tabular-nums font-semibold text-emerald-600">{formatMoney(row.paid)}</td>
                      <td className={`text-right tabular-nums ${row.closingBalance > 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-600'}`}>{formatMoney(row.closingBalance)}</td>
                      <td className="text-right tabular-nums">{row.upfrontCredit > 0 ? <span className="badge badge-success">{formatMoney(row.upfrontCredit)}</span> : <span className="text-slate-400 text-sm">-</span>}</td>
                      <td><span className="badge badge-info">{row.invoiceCount}</span></td>
                      <td>{renderFinanceTags(row.bursary, row.discount)}</td>
                      <td>{row.invoiceCount === 0 && row.openingBalance > 0 ? <span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">Last term balance</span> : row.hasFullBursary ? <span className="badge badge-success">Paid</span> : row.closingBalance <= 0 ? <span className="badge badge-success">Cleared</span> : <span className="badge badge-danger">Balance</span>}</td>
                      <td><button onClick={(e) => { e.stopPropagation(); setSelectedLedgerStudentId(row.student.id); }} className="btn btn-secondary text-xs py-1.5"><FileText size={12} /> View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ProgressiveListLoader hasMore={ledgerProgress.hasMore} loadingMore={ledgerProgress.loadingMore} onVisible={ledgerProgress.loadMore} />
            </div>
              </>
            )}
              </div>
            </div>
          </div>
        )}

        {/* Invoices Tab - one row per student, expandable fee history */}
        {activeTab === 'invoices' && (
          <div className="table-container">
            <table>
              <thead><tr><th style={{width:'32px'}}></th><th>No.</th><th>Student</th><th>Invoices</th><th>Tags</th><th>Last Term</th><th>Current Total</th><th>Payable</th><th>Total Paid</th><th>Upfront Credit</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {invoicesByStudent.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center"><FileText size={24} className="text-violet-400" /></div>
                      <p className="text-slate-500 font-medium">No invoices yet</p>
                    </div>
                  </td></tr>
                ) : visibleInvoicesByStudent.map(({ student, fees: sf, openingBalance, totalInv, payable, totalPaid, upfrontCredit, balance, bursary, discount, hasFullBursary, hasCurrentInvoice }, index) => {
                  const isExpanded = expandedInvoices.has(student.id);
                  const status = !hasCurrentInvoice && openingBalance > 0 ? 'Last term' : balance <= 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Pending';
                  const badge: Record<string, string> = { Paid: 'badge-success', Partial: 'badge-warning', Pending: 'badge-danger' };
                  return (
                    <React.Fragment key={student.id}>
                      <tr className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => toggleInvoice(student.id)}>
                        <td><ChevronRight size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                        <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                        <td className="font-medium">{student.firstName} {student.lastName}</td>
                        <td><span className="badge badge-info">{sf.length}</span></td>
                        <td>{renderFinanceTags(bursary, discount)}</td>
                        <td>{openingBalance > 0 ? <span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">{formatMoney(openingBalance)}</span> : <span className="text-slate-400 text-sm">-</span>}</td>
                        <td>
                          <span className="font-semibold">{formatMoney(openingBalance + totalInv)}</span>
                          {openingBalance > 0 && (
                            <span className="ml-2 badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 text-[10px]">
                              top-up
                            </span>
                          )}
                        </td>
                        <td className="font-semibold text-indigo-600 dark:text-indigo-300">{formatMoney(payable)}</td>
                        <td className="text-emerald-600 font-semibold">{formatMoney(totalPaid)}</td>
                        <td>{upfrontCredit > 0 ? <span className="badge badge-success">{formatMoney(upfrontCredit)}</span> : <span className="text-slate-400 text-sm">-</span>}</td>
                        <td className={balance > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{formatMoney(balance)}</td>
                        <td><span className={`badge ${status === 'Last term' ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' : badge[status]}`}>{status}</span></td>
                      </tr>
                      {isExpanded && sf.map(fee => {
                        const actualPaid = payments.filter(p => p.feeId === fee.id).reduce((a, p) => a + p.amount, 0);
                        const feePayable = getPayableAmount(fee.amount, bursary, discount);
                        const paid = hasFullBursary ? Math.max(actualPaid, fee.amount) : actualPaid;
                        const feeBalance = hasFullBursary ? 0 : Math.max(0, feePayable - actualPaid);
                        const feeStatus = hasFullBursary || actualPaid >= feePayable ? 'Paid' : actualPaid > 0 ? 'Partial' : 'Pending';
                        return (
                          <tr key={fee.id} className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td></td>
                            <td></td>
                            <td colSpan={3} className="pl-8 text-sm text-slate-600 dark:text-slate-300">
                              <Receipt size={12} className="inline mr-2 text-slate-400" />{fee.description}
                              {fee.term && <span className="ml-2 badge badge-info text-[10px]">Term {fee.term}</span>}
                              {hasFullBursary && <span className="ml-2 badge badge-success text-[10px]">Full bursary</span>}
                            </td>
                            <td className="text-sm">{formatMoney(fee.amount)}</td>
                            <td className="text-sm text-indigo-600 dark:text-indigo-300">{formatMoney(feePayable)}</td>
                            <td className="text-sm text-emerald-600">{formatMoney(paid)}</td>
                            <td className="text-sm text-slate-400">-</td>
                            <td className={`text-sm ${feeBalance > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatMoney(feeBalance)}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className={`badge ${badge[feeStatus]} text-[10px]`}>{feeStatus}</span>
                                {feeStatus !== 'Paid' && <button onClick={e => { e.stopPropagation(); openPayModal(fee.id, fee.studentId!, feeBalance); }} className="btn btn-secondary text-xs py-1 px-2"><CreditCard size={11} /> Pay</button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <ProgressiveListLoader hasMore={invoiceProgress.hasMore} loadingMore={invoiceProgress.loadingMore} onVisible={invoiceProgress.loadMore} />
          </div>
        )}

        {/* Payments Tab - one row per student, expandable payment history */}
        {activeTab === 'payments' && (
          <div className="table-container">
            <table>
              <thead><tr><th style={{width:'32px'}}></th><th>No.</th><th>Student</th><th>Payments</th><th>Total Paid</th><th>Last Payment</th></tr></thead>
              <tbody>
                {paymentsByStudent.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Receipt size={24} className="text-green-400" /></div>
                      <p className="text-slate-500 font-medium">No payments recorded</p>
                    </div>
                  </td></tr>
                ) : visiblePaymentsByStudent.map(({ student, payments: sp, total }, index) => {
                  const isExpanded = expandedPayments.has(student.id);
                  const last = sp[0];
                  return (
                    <React.Fragment key={student.id}>
                      <tr key={student.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => togglePayment(student.id)}>
                        <td><ChevronRight size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                        <td className="text-center text-xs font-semibold text-slate-400">{index + 1}</td>
                        <td className="font-medium">{student.firstName} {student.lastName}</td>
                        <td><span className="badge badge-info">{sp.length}</span></td>
                        <td className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(total)}</td>
                        <td className="text-slate-500 text-sm">{last ? new Date(last.date).toLocaleDateString() : '-'}</td>
                      </tr>
                      {isExpanded && sp.map(p => {
                        const fee = feeRows.find(f => f.id === p.feeId);
                        const dt = new Date(p.date);
                        return (
                          <tr key={p.id} className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td></td>
                            <td></td>
                            <td colSpan={2} className="pl-8 text-sm text-slate-600 dark:text-slate-300">
                              <Receipt size={12} className="inline mr-2 text-slate-400" />
                              <span className="font-medium">{dt.toLocaleDateString()}</span>
                              <span className="text-slate-400 ml-1">{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {fee && <span className="ml-2 text-slate-500">- {fee.description}</span>}
                            </td>
                            <td className="text-sm font-semibold text-emerald-600">{formatMoney(p.amount)}</td>
                            <td><span className="badge badge-info capitalize text-[10px]">{p.method?.replace('_', ' ')}</span></td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <ProgressiveListLoader hasMore={paymentProgress.hasMore} loadingMore={paymentProgress.loadingMore} onVisible={paymentProgress.loadMore} />
          </div>
        )}

        {/* Accounts Tab - payment accounts embedded on invoices */}
        {activeTab === 'accounts' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Payment Accounts</h2>
                <p className="text-sm text-slate-500 mt-0.5">These accounts appear on all student invoices as payment destinations.</p>
              </div>
              <Link to="/payment-accounts" className="btn btn-secondary text-sm py-1.5 flex items-center gap-2">
                <Edit size={14} /> Setup Accounts
              </Link>
            </div>

            {filteredBankAccounts.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Building2 size={28} className="text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">{bankAccounts.length === 0 ? 'No payment accounts configured' : 'No accounts match your search'}</p>
                  <p className="text-sm text-slate-400 mt-1">{bankAccounts.length === 0 ? 'Add bank accounts on the Payment Accounts page' : 'Try another account name, number, bank, or method.'}</p>
                </div>
                {bankAccounts.length === 0 && <Link to="/payment-accounts" className="btn btn-primary text-sm py-1.5">
                  <Plus size={14} /> Add Accounts
                </Link>}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBankAccounts.map((acc, i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
                        <Building2 size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 dark:text-white truncate">{acc.bankName || 'Bank Account'}</p>
                        <p className="text-sm text-slate-500 truncate">{acc.accountName}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-400">#{i + 1}</span>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 uppercase tracking-wider">Account No.</span>
                        <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{acc.accountNumber || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 uppercase tracking-wider">Method</span>
                        <span className="badge badge-info text-[10px]">{acc.paymentMethod || 'BANK TRANSFER'}</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <FileText size={11} /> Appears on all student invoices
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bankAccounts.length > 0 && (
              <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 flex items-start gap-3">
                <CreditCard size={18} className="text-indigo-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">Invoice Integration</p>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                    All {bankAccounts.length} account{bankAccounts.length > 1 ? 's are' : ' is'} automatically embedded on student invoices in the Payment Details section. To update accounts, open <Link to="/payment-accounts" className="underline font-semibold">Payment Accounts</Link>.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import Modal - fixed inset-0 full-page blur */}
      {showImportModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2"><Upload size={18} className="text-white" /><h2 className="font-bold text-white">Import Payments</h2></div>
              <button onClick={closeImportModal} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={18} className="text-white" /></button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-56px)]">
              {importStep === 'upload' && (
                <div className="space-y-4">
                  <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium"><Download size={14} />Download Template</button>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 transition-colors" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload CSV</p>
                  </div>
                </div>
              )}
              {importStep === 'map' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded">1</span><ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">2 Map</span><ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 rounded">3</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-xs"><thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0"><tr><th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">File Column</th><th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Sample</th><th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Maps To</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {csvHeaders.map((header, idx) => {
                        const sample = csvData[0]?.[idx] || '';
                        const currentMapping = Object.entries(fieldMapping).find(([, v]) => v === header)?.[0] || '';
                        return (
                          <tr key={header} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}>
                            <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{header}</td>
                            <td className="px-3 py-2 text-slate-400 truncate max-w-[80px]">{sample}</td>
                            <td className="px-3 py-2">
                              <select value={currentMapping} onChange={e => { const nk = e.target.value; setFieldMapping(p => { const next = { ...p }; Object.keys(next).forEach(k => { if (next[k] === header) delete next[k]; }); if (nk) next[nk] = header; return next; }); }} className="w-full form-input py-1 px-2 text-xs">
                                <option value="">Skip</option>
                                {paymentExpectedFields.map(f => <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>)}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody></table>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={closeImportModal} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={processMapping} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">Preview <ArrowRight size={14} /></button>
                  </div>
                </div>
              )}
              {importStep === 'preview' && (
                <div data-preview-fullscreen-root className="space-y-3 rounded-xl bg-white p-1 dark:bg-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 1</span><ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 2</span><ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3 Preview</span>
                    </div>
                    <FullscreenButton />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                      <p className="text-sm text-emerald-700 dark:text-emerald-300"><strong>{importPreview.length - duplicateImportRows.size}</strong> payments available</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5">
                      <p className="text-sm text-amber-700 dark:text-amber-300"><strong>{duplicateImportRows.size}</strong> duplicates skipped</p>
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 dark:bg-slate-700/50"><th className="px-3 py-2 text-left">Student</th><th className="px-3 py-2 text-left">Amount</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.map((r, i) => (
                          <tr key={i} className={duplicateImportRows.has(i) ? 'bg-amber-50 dark:bg-amber-900/10' : ''}>
                            <td className="px-3 py-2">{r.studentName}</td>
                            <td className="px-3 py-2">{r.amount}</td>
                            <td className="px-3 py-2">{r.date}</td>
                            <td className="px-3 py-2">{duplicateImportRows.has(i) ? <span className="badge badge-warning">Duplicate</span> : <span className="badge badge-success">Available</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm" disabled={isImporting}>Back</button>
                    <button onClick={executeImport} disabled={isImporting || importPreview.length - duplicateImportRows.size <= 0} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-70">
                      {isImporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                      Import {importPreview.length - duplicateImportRows.size}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Record Payment Modal */}
      {payModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setPayModal(null); }}>
          <div className="modal-card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <h3 className="font-bold text-white flex items-center gap-2"><CreditCard size={18} /> Record Payment</h3>
              <button onClick={() => setPayModal(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={18} className="text-white" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{payModal.studentName}</p>
                <p className="text-xs text-slate-500">{payModal.description}</p>
                <p className="text-xs text-slate-500">Remaining: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatMoney(payModal.amount)}</span></p>
              </div>
              <div className="space-y-2">
                <label className="form-label">Amount</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="form-input"
                  placeholder="Enter amount"
                  min="0"
                  step="0.01"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="form-label">Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="form-input">
                  <option value={PaymentMethod.CASH}>Cash</option>
                  <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setPayModal(null)} className="btn btn-secondary flex-1" disabled={isRecordingPayment}>Cancel</button>
                <button
                  onClick={() => handleRecordPayment(payModal.feeId, payModal.studentId, payModal.amount)}
                  disabled={isRecordingPayment || !payAmount || isNaN(parseFloat(payAmount)) || parseFloat(payAmount) <= 0}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isRecordingPayment
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                    : <><CheckIcon size={16} /> Record</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {showImportSuccess && (
        <SuccessPopup 
          message="Import Complete!" 
          subMessage="Payment records have been updated."
          onClose={() => setShowImportSuccess(false)}
        />
      )}
    </div>
  );
}
