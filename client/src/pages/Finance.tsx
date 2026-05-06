import { useEffect, useState, useRef } from 'react';
import { DollarSign, Receipt, FileText, Users, Download, Upload, X, Check, ChevronDown, Check as CheckIcon, CreditCard, Search, Filter, ArrowRight, ChevronRight } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Fee, Payment, PaymentMethod } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { useCurrency } from '../hooks/useCurrency';
import { exportToPDF, exportToCSV, exportToExcel } from '../utils/export';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';

export default function Finance() {
  const { user, schoolId } = useAuth();
  const [activeTab, setActiveTab] = useState<'students' | 'invoices' | 'payments'>('students');
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const termFilterRef = useRef<HTMLDivElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerm, setFilterTerm] = useState('all');
  const [showTermFilter, setShowTermFilter] = useState(false);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [expandedPayments, setExpandedPayments] = useState<Set<string>>(new Set());
  // Payment modal state
  const [payModal, setPayModal] = useState<{ feeId: string; studentId: string; amount: number; studentName: string; description: string } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>(PaymentMethod.CASH);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const students = useActiveStudents();
  const sid = schoolId || user?.id || '';
  const { data: fees } = useTableData(sid, 'fees');
  const { data: payments } = useTableData(sid, 'payments');

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
    setImportPreview(mapped); setImportStep('preview');
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (!importPreview.length || !id) { addToast('No valid records', 'error'); return; }
    let count = 0;
    const now = new Date().toISOString();
    for (const d of importPreview) {
      const s = students.find(x => `${x.firstName} ${x.lastName}` === d.studentName);
      if (!s) continue;
      await dataService.create(id, 'payments', { id: uuidv4(), feeId: '', studentId: s.id, amount: parseFloat(d.amount), method: (d.method as PaymentMethod) || PaymentMethod.CASH, date: d.date || now, createdAt: now } as any);
      count++;
    }
    addToast(`Imported ${count} payments`, 'success'); closeImportModal();
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
  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);
  const totalInvoiced = fees.reduce((s, f) => s + f.amount, 0);
  const totalPending = totalInvoiced - totalCollected;

  const studentFinanceSummary = students.map(student => {
    const sf = fees.filter(f => f.studentId === student.id);
    const inv = sf.reduce((a, f) => a + f.amount, 0);
    const paid = payments.filter(p => p.feeId ? sf.some(f => f.id === p.feeId) : p.studentId === student.id).reduce((a, p) => a + p.amount, 0);
    return { id: student.id, studentName: `${student.firstName} ${student.lastName}`, studentId: student.studentId, totalInvoiced: inv, totalPaid: paid, balance: inv - paid, invoiceCount: sf.length, isCleared: sf.length > 0 && inv - paid <= 0 };
  }).filter(s => filterTerm === 'all' ? s.invoiceCount > 0 : s.invoiceCount > 0);

  const filteredStudentFinance = studentFinanceSummary.filter(s => !searchTerm || s.studentName.toLowerCase().includes(searchTerm.toLowerCase()));

  // Group fees by student for Invoices tab
  const invoicesByStudent = students.map(student => {
    const sf = fees.filter(f => {
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || `${student.firstName} ${student.lastName}`.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
      const matchTerm = filterTerm === 'all' || f.term === filterTerm;
      return f.studentId === student.id && matchSearch && matchTerm;
    });
    if (sf.length === 0) return null;
    const totalInv = sf.reduce((a, f) => a + f.amount, 0);
    const totalPaid = sf.reduce((a, f) => a + payments.filter(p => p.feeId === f.id).reduce((x, p) => x + p.amount, 0), 0);
    return { student, fees: sf, totalInv, totalPaid, balance: totalInv - totalPaid };
  }).filter(Boolean) as { student: any; fees: Fee[]; totalInv: number; totalPaid: number; balance: number }[];

  // Group payments by student for Payments tab
  const paymentsByStudent = students.map(student => {
    const sp = payments.filter(p => {
      const q = searchTerm.toLowerCase();
      const matchSearch = !q || `${student.firstName} ${student.lastName}`.toLowerCase().includes(q) || p.method.toLowerCase().includes(q);
      return p.studentId === student.id && matchSearch;
    });
    if (sp.length === 0) return null;
    const total = sp.reduce((a, p) => a + p.amount, 0);
    const sorted = [...sp].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { student, payments: sorted, total };
  }).filter(Boolean) as { student: any; payments: Payment[]; total: number }[];

  const tabs = [
    { id: 'students', label: 'Students', icon: Users },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'payments', label: 'Payments', icon: Receipt },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Finance Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track fees, invoices, and payments</p>
        </div>
        <div className="flex items-center gap-2">
          {(activeTab === 'invoices' || activeTab === 'payments') && (
            <div className="relative" ref={exportMenuRef}>
              <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-secondary">
                <Download size={16} /><span className="hidden sm:inline">Export</span>
                <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                  {activeTab === 'invoices' && <>
                    <button onClick={handleExportInvoicesCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} />Export CSV</button>
                    <button onClick={handleExportInvoicesExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export Excel</button>
                  </>}
                  {activeTab === 'payments' && <>
                    <button onClick={handleExportPaymentsCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} />Export CSV</button>
                    <button onClick={handleExportPaymentsExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export Excel</button>
                  </>}
                </div>
              )}
            </div>
          )}
          {activeTab === 'payments' && (
            <button onClick={() => { setShowImportModal(true); fileInputRef.current?.click(); }} className="btn btn-secondary">
              <Upload size={16} /><span className="hidden sm:inline">Import</span>
            </button>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".xlsx,.xls" className="hidden" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Receipt size={24} className="text-white" /></div>
            <div><p className="text-sm font-medium text-white/80">Collected</p><p className="text-2xl font-bold text-white">{formatMoney(totalCollected)}</p></div>
          </div>
        </div>
        <div className="card-solid-rose p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><DollarSign size={24} className="text-white" /></div>
            <div><p className="text-sm font-medium text-white/80">Pending</p><p className="text-2xl font-bold text-white">{formatMoney(totalPending)}</p></div>
          </div>
        </div>
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><FileText size={24} className="text-white" /></div>
            <div><p className="text-sm font-medium text-white/80">Invoiced</p><p className="text-2xl font-bold text-white">{formatMoney(totalInvoiced)}</p></div>
          </div>
        </div>
        <div className="card-solid-violet p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"><Receipt size={24} className="text-white" /></div>
            <div><p className="text-sm font-medium text-white/80">Transactions</p><p className="text-2xl font-bold text-white">{payments.length}</p></div>
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="card">
        <div className="card-header">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                  <tab.icon size={16} />{tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {activeTab === 'invoices' && (
                <div className="relative" ref={termFilterRef}>
                  <button onClick={() => setShowTermFilter(!showTermFilter)}
                    className="btn btn-secondary flex items-center gap-2">
                    <Filter size={16} />
                    <span className="hidden sm:inline">{filterTerm === 'all' ? 'All Terms' : `Term ${filterTerm}`}</span>
                    <ChevronDown size={14} className={`transition-transform ${showTermFilter ? 'rotate-180' : ''}`} />
                  </button>
                  {showTermFilter && (
                    <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                      {['all', '1', '2', '3'].map(t => (
                        <button key={t} onClick={() => { setFilterTerm(t); setShowTermFilter(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${filterTerm === t ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                          {t === 'all' ? 'All Terms' : `Term ${t}`}
                          {filterTerm === t && <Check size={14} className="ml-auto" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="relative">
                <Search size={18} className="search-input-icon" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="search-input w-48" />
              </div>
            </div>
          </div>
        </div>

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="table-container">
            <table>
              <thead><tr><th>Student</th><th>ID Number</th><th>Invoices</th><th>Total Invoiced</th><th>Total Paid</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {filteredStudentFinance.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center"><Users size={24} className="text-violet-400" /></div>
                      <p className="text-slate-500 font-medium">No invoiced students</p>
                    </div>
                  </td></tr>
                ) : filteredStudentFinance.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.studentName}</td>
                    <td className="text-slate-500">{s.studentId}</td>
                    <td><span className="badge badge-info">{s.invoiceCount}</span></td>
                    <td className="font-semibold">{formatMoney(s.totalInvoiced)}</td>
                    <td className="text-emerald-600 font-semibold">{formatMoney(s.totalPaid)}</td>
                    <td className={s.balance > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{formatMoney(s.balance)}</td>
                    <td>{s.isCleared ? <span className="badge badge-success">Cleared</span> : s.balance > 0 ? <span className="badge badge-danger">Balance: {formatMoney(s.balance)}</span> : <span className="badge badge-warning">No Invoice</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Invoices Tab � one row per student, expandable fee history */}
        {activeTab === 'invoices' && (
          <div className="table-container">
            <table>
              <thead><tr><th style={{width:'32px'}}></th><th>Student</th><th>Invoices</th><th>Total Invoiced</th><th>Total Paid</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {invoicesByStudent.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center"><FileText size={24} className="text-violet-400" /></div>
                      <p className="text-slate-500 font-medium">No invoices yet</p>
                    </div>
                  </td></tr>
                ) : invoicesByStudent.map(({ student, fees: sf, totalInv, totalPaid, balance }) => {
                  const isExpanded = expandedInvoices.has(student.id);
                  const status = balance <= 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Pending';
                  const badge: Record<string, string> = { Paid: 'badge-success', Partial: 'badge-warning', Pending: 'badge-danger' };
                  return (
                    <>
                      <tr key={student.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => toggleInvoice(student.id)}>
                        <td><ChevronRight size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                        <td className="font-medium">{student.firstName} {student.lastName}</td>
                        <td><span className="badge badge-info">{sf.length}</span></td>
                        <td className="font-semibold">{formatMoney(totalInv)}</td>
                        <td className="text-emerald-600 font-semibold">{formatMoney(totalPaid)}</td>
                        <td className={balance > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>{formatMoney(balance)}</td>
                        <td><span className={`badge ${badge[status]}`}>{status}</span></td>
                      </tr>
                      {isExpanded && sf.map(fee => {
                        const paid = payments.filter(p => p.feeId === fee.id).reduce((a, p) => a + p.amount, 0);
                        const feeStatus = paid >= fee.amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
                        return (
                          <tr key={fee.id} className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td></td>
                            <td colSpan={2} className="pl-8 text-sm text-slate-600 dark:text-slate-300">
                              <span className="text-slate-400 mr-2">?</span>{fee.description}
                              {fee.term && <span className="ml-2 badge badge-info text-[10px]">Term {fee.term}</span>}
                            </td>
                            <td className="text-sm">{formatMoney(fee.amount)}</td>
                            <td className="text-sm text-emerald-600">{formatMoney(paid)}</td>
                            <td className={`text-sm ${fee.amount - paid > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatMoney(fee.amount - paid)}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className={`badge ${badge[feeStatus]} text-[10px]`}>{feeStatus}</span>
                                {feeStatus !== 'Paid' && <button onClick={e => { e.stopPropagation(); openPayModal(fee.id, fee.studentId!, fee.amount - paid); }} className="btn btn-secondary text-xs py-1 px-2"><CreditCard size={11} /> Pay</button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Payments Tab � one row per student, expandable payment history */}
        {activeTab === 'payments' && (
          <div className="table-container">
            <table>
              <thead><tr><th style={{width:'32px'}}></th><th>Student</th><th>Payments</th><th>Total Paid</th><th>Last Payment</th></tr></thead>
              <tbody>
                {paymentsByStudent.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Receipt size={24} className="text-green-400" /></div>
                      <p className="text-slate-500 font-medium">No payments recorded</p>
                    </div>
                  </td></tr>
                ) : paymentsByStudent.map(({ student, payments: sp, total }) => {
                  const isExpanded = expandedPayments.has(student.id);
                  const last = sp[0];
                  return (
                    <>
                      <tr key={student.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => togglePayment(student.id)}>
                        <td><ChevronRight size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></td>
                        <td className="font-medium">{student.firstName} {student.lastName}</td>
                        <td><span className="badge badge-info">{sp.length}</span></td>
                        <td className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(total)}</td>
                        <td className="text-slate-500 text-sm">{last ? new Date(last.date).toLocaleDateString() : '�'}</td>
                      </tr>
                      {isExpanded && sp.map(p => {
                        const fee = fees.find(f => f.id === p.feeId);
                        const dt = new Date(p.date);
                        return (
                          <tr key={p.id} className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td></td>
                            <td colSpan={2} className="pl-8 text-sm text-slate-600 dark:text-slate-300">
                              <span className="text-slate-400 mr-2">?</span>
                              <span className="font-medium">{dt.toLocaleDateString()}</span>
                              <span className="text-slate-400 ml-1">{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {fee && <span className="ml-2 text-slate-500">� {fee.description}</span>}
                            </td>
                            <td className="text-sm font-semibold text-emerald-600">{formatMoney(p.amount)}</td>
                            <td><span className="badge badge-info capitalize text-[10px]">{p.method?.replace('_', ' ')}</span></td>
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import Modal � fixed inset-0 full-page blur */}
      {showImportModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
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
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 1</span><ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><CheckIcon size={10} /> 2</span><ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3 Preview</span>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300"><strong>{importPreview.length}</strong> payments ready to import</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-slate-50 dark:bg-slate-700/50"><th className="px-3 py-2 text-left">Student</th><th className="px-3 py-2 text-left">Amount</th><th className="px-3 py-2 text-left">Date</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.slice(0, 10).map((r, i) => (
                          <tr key={i}><td className="px-3 py-2">{r.studentName}</td><td className="px-3 py-2">{r.amount}</td><td className="px-3 py-2">{r.date}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm">Back</button>
                    <button onClick={executeImport} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1"><Check size={14} />Import</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setPayModal(null); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 overflow-hidden" onClick={e => e.stopPropagation()}>
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
      )}
    </div>
  );
}
