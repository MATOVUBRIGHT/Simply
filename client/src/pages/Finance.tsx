import { useEffect, useState, useRef } from 'react';
import { DollarSign, Receipt, FileText, Users, Download, Upload, X, Check, ChevronDown, Check as CheckIcon, CreditCard, Search, Filter, ArrowRight } from 'lucide-react';
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

  const students = useActiveStudents();
  const sid = schoolId || user?.id || '';
  const { data: fees } = useTableData(sid, 'fees');
  const { data: payments } = useTableData(sid, 'payments');

  async function handleRecordPayment(feeId: string, studentId: string, _amount: number) {
    const id = schoolId || user?.id;
    if (!id) return;
    const raw = prompt('Enter payment amount:');
    if (!raw || isNaN(parseFloat(raw))) return;
    try {
      await dataService.create(id, 'payments', {
        id: uuidv4(), feeId, studentId,
        amount: parseFloat(raw),
        method: PaymentMethod.CASH,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      } as any);
      addToast('Payment recorded', 'success');
    } catch { addToast('Failed to record payment', 'error'); }
  }

  // -- Export helpers ----------------------------------------------------------
  function handleExportInvoicesCSV() {
    const data = fees.map(f => { const s = students.find(x => x.id === f.studentId); return { ...f, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A' }; });
    exportToCSV(data, 'invoices', [{ key: 'studentName' as any, label: 'Student' }, { key: 'description' as any, label: 'Description' }, { key: 'amount' as any, label: 'Amount' }, { key: 'term' as any, label: 'Term' }]);
    addToast('Exported CSV', 'success'); setShowExportMenu(false);
  }
  function handleExportInvoicesPDF() {
    const data = fees.map(f => { const s = students.find(x => x.id === f.studentId); const paid = payments.filter(p => p.feeId === f.id).reduce((a, p) => a + p.amount, 0); return { ...f, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A', status: paid >= f.amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending' }; });
    exportToPDF('Invoices Report', data, [{ key: 'studentName', label: 'Student' }, { key: 'description', label: 'Description' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }], 'invoices');
    addToast('Exported PDF', 'success'); setShowExportMenu(false);
  }
  function handleExportInvoicesExcel() {
    const data = fees.map(f => { const s = students.find(x => x.id === f.studentId); return { ...f, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A' }; });
    exportToExcel(data, 'invoices', [{ key: 'studentName' as any, label: 'Student' }, { key: 'description' as any, label: 'Description' }, { key: 'amount' as any, label: 'Amount' }, { key: 'term' as any, label: 'Term' }]);
    addToast('Exported Excel', 'success'); setShowExportMenu(false);
  }
  function handleExportPaymentsCSV() {
    const data = payments.map(p => { const s = students.find(x => x.id === p.studentId); return { ...p, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A' }; });
    exportToCSV(data, 'payments', [{ key: 'studentName' as any, label: 'Student' }, { key: 'amount' as any, label: 'Amount' }, { key: 'method' as any, label: 'Method' }, { key: 'date' as any, label: 'Date' }]);
    addToast('Exported CSV', 'success'); setShowExportMenu(false);
  }
  function handleExportPaymentsPDF() {
    const data = payments.map(p => { const s = students.find(x => x.id === p.studentId); return { ...p, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A', date: new Date(p.date).toLocaleDateString() }; });
    exportToPDF('Payments Report', data, [{ key: 'studentName', label: 'Student' }, { key: 'amount', label: 'Amount' }, { key: 'method', label: 'Method' }, { key: 'date', label: 'Date' }], 'payments');
    addToast('Exported PDF', 'success'); setShowExportMenu(false);
  }
  function handleExportPaymentsExcel() {
    const data = payments.map(p => { const s = students.find(x => x.id === p.studentId); return { ...p, studentName: s ? `${s.firstName} ${s.lastName}` : 'N/A' }; });
    exportToExcel(data, 'payments', [{ key: 'studentName' as any, label: 'Student' }, { key: 'amount' as any, label: 'Amount' }, { key: 'method' as any, label: 'Method' }, { key: 'date' as any, label: 'Date' }]);
    addToast('Exported Excel', 'success'); setShowExportMenu(false);
  }

  // -- Import helpers ----------------------------------------------------------
  const paymentExpectedFields = [
    { key: 'studentName', label: 'Student Name', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'method', label: 'Method', required: false },
    { key: 'date', label: 'Date', required: true },
  ];

  function downloadTemplate() {
    const csv = ['Student Name,Amount,Method,Date', 'John Doe,50000,cash,2024-01-15'].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'payments-template.csv'; a.click();
    addToast('Template downloaded', 'success');
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
      const lines = (await file.text()).split('\n').filter(l => l.trim());
      if (lines.length < 2) { addToast('CSV needs headers + data', 'error'); return; }
      const headers = parseCSVLine(lines[0]);
      setCsvHeaders(headers); setCsvData(lines.slice(1).map(parseCSVLine));
      const auto: Record<string, string> = {};
      paymentExpectedFields.forEach(f => { const h = headers.find(h => h.toLowerCase().includes(f.key.toLowerCase())); if (h) auto[f.key] = h; });
      setFieldMapping(auto); setImportStep('map'); setShowImportModal(true);
    } catch { addToast('Failed to read CSV', 'error'); }
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

  const filteredFees = fees.filter(f => {
    const s = students.find(x => x.id === f.studentId);
    const q = searchTerm.toLowerCase();
    return (!q || f.description.toLowerCase().includes(q) || (s ? `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) : false))
      && (filterTerm === 'all' || f.term === filterTerm);
  });

  const filteredPayments = payments.filter(p => {
    const s = students.find(x => x.id === p.studentId);
    const q = searchTerm.toLowerCase();
    return !q || (s ? `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) : false) || p.method.toLowerCase().includes(q);
  });

  const studentFinanceSummary = students.map(student => {
    const sf = fees.filter(f => f.studentId === student.id);
    const inv = sf.reduce((a, f) => a + f.amount, 0);
    const paid = payments.filter(p => p.feeId ? sf.some(f => f.id === p.feeId) : p.studentId === student.id).reduce((a, p) => a + p.amount, 0);
    return { id: student.id, studentName: `${student.firstName} ${student.lastName}`, studentId: student.studentId, totalInvoiced: inv, totalPaid: paid, balance: inv - paid, invoiceCount: sf.length, isCleared: sf.length > 0 && inv - paid <= 0 };
  }).filter(s => s.invoiceCount > 0 || filterTerm === 'all');

  const filteredStudentFinance = studentFinanceSummary.filter(s => !searchTerm || s.studentName.toLowerCase().includes(searchTerm.toLowerCase()));

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
          {activeTab === 'invoices' && (
            <div className="relative" ref={exportMenuRef}>
              <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-secondary">
                <Download size={16} /><span className="hidden sm:inline">Export</span>
                <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                  <button onClick={handleExportInvoicesPDF} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export PDF</button>
                  <button onClick={handleExportInvoicesCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} />Export CSV</button>
                  <button onClick={handleExportInvoicesExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export Excel</button>
                </div>
              )}
            </div>
          )}
          {activeTab === 'payments' && (
            <>
              <div className="relative" ref={exportMenuRef}>
                <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-secondary">
                  <Download size={16} /><span className="hidden sm:inline">Export</span>
                  <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                    <button onClick={handleExportPaymentsPDF} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export PDF</button>
                    <button onClick={handleExportPaymentsCSV} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} />Export CSV</button>
                    <button onClick={handleExportPaymentsExcel} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} />Export Excel</button>
                  </div>
                )}
              </div>
              <button onClick={() => { setShowImportModal(true); fileInputRef.current?.click(); }} className="btn btn-secondary">
                <Upload size={16} /><span className="hidden sm:inline">Import</span>
              </button>
            </>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".csv" className="hidden" />
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
            <div className="flex items-center gap-2">
              <div className="relative" ref={termFilterRef}>
                <button onClick={() => setShowTermFilter(!showTermFilter)}
                  className={`btn btn-secondary flex items-center gap-2 ${filterTerm !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}>
                  <Filter size={16} />
                  <span className="hidden sm:inline">{filterTerm === 'all' ? 'All Terms' : `Term ${filterTerm}`}</span>
                  <ChevronDown size={14} className={`transition-transform ${showTermFilter ? 'rotate-180' : ''}`} />
                </button>
                {showTermFilter && (
                  <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                    {['all', '1', '2', '3'].map(t => (
                      <button key={t} onClick={() => { setFilterTerm(t); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${filterTerm === t ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                        {t === 'all' ? 'All Terms' : `Term ${t}`}
                        {filterTerm === t && <Check size={14} className="ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Search size={18} className="search-input-icon" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="search-input w-48" />
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                {activeTab === 'students' && <><th>Student</th><th>Admission No</th><th>Invoices</th><th>Total Invoiced</th><th>Total Paid</th><th>Balance</th><th>Status</th></>}
                {activeTab === 'invoices' && <><th>Student</th><th>Description</th><th>Amount</th><th>Term</th><th>Status</th><th>Actions</th></>}
                {activeTab === 'payments' && <><th>Date</th><th>Student</th><th>Amount</th><th>Method</th></>}
              </tr>
            </thead>
            <tbody>
              {activeTab === 'students' && filteredStudentFinance.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center"><Users size={24} className="text-violet-400" /></div>
                    <p className="text-slate-500 font-medium">No invoiced students</p>
                    <p className="text-slate-400 text-sm">Generate invoices from the Invoices page</p>
                  </div>
                </td></tr>
              )}
              {activeTab === 'invoices' && filteredFees.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center"><FileText size={24} className="text-violet-400" /></div>
                    <p className="text-slate-500 font-medium">No invoices yet</p>
                    <p className="text-slate-400 text-sm">Go to the Invoices page to generate invoices</p>
                  </div>
                </td></tr>
              )}
              {activeTab === 'payments' && filteredPayments.length === 0 && (
                <tr><td colSpan={4} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><Receipt size={24} className="text-green-400" /></div>
                    <p className="text-slate-500 font-medium">No payments recorded</p>
                  </div>
                </td></tr>
              )}
              {activeTab === 'students' && filteredStudentFinance.map(s => (
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
              {activeTab === 'invoices' && filteredFees.map(fee => {
                const s = students.find(x => x.id === fee.studentId);
                const paid = payments.filter(p => p.feeId === fee.id).reduce((a, p) => a + p.amount, 0);
                const status = paid >= fee.amount ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
                const badge: Record<string, string> = { Paid: 'badge-success', Partial: 'badge-warning', Pending: 'badge-danger' };
                return (
                  <tr key={fee.id}>
                    <td className="font-medium">{s ? `${s.firstName} ${s.lastName}` : <span className="text-slate-400">N/A</span>}</td>
                    <td>{fee.description}</td>
                    <td className="font-semibold">{formatMoney(fee.amount)}</td>
                    <td><span className="badge badge-info">Term {fee.term}</span></td>
                    <td><span className={`badge ${badge[status]}`}>{status}</span></td>
                    <td>{status !== 'Paid' && <button onClick={() => handleRecordPayment(fee.id, fee.studentId!, fee.amount - paid)} className="btn btn-secondary text-xs py-1.5"><CreditCard size={12} /> Record</button>}</td>
                  </tr>
                );
              })}
              {activeTab === 'payments' && filteredPayments.map(p => {
                const s = students.find(x => x.id === p.studentId);
                return (
                  <tr key={p.id}>
                    <td className="text-slate-500">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="font-medium">{s ? `${s.firstName} ${s.lastName}` : 'N/A'}</td>
                    <td className="font-bold text-green-600 dark:text-green-400">{formatMoney(p.amount)}</td>
                    <td><span className="badge badge-info capitalize">{p.method.replace('_', ' ')}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-x-0 top-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) closeImportModal(); }}>
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
                    <table className="w-full text-xs"><tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {paymentExpectedFields.filter(f => f.required).map(f => (
                        <tr key={f.key}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{f.label}*</td>
                          <td className="px-2 py-1.5">
                            <select value={fieldMapping[f.key] || ''} onChange={e => setFieldMapping(p => ({ ...p, [f.key]: e.target.value }))} className="w-full form-input py-1 px-2 text-xs">
                              <option value="">-- Skip --</option>
                              {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
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
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3</span>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300"><strong>{importPreview.length}</strong> payments ready</p>
                  </div>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0"><tr><th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">Name</th><th className="px-2 py-1.5 text-left">Amount</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.slice(0, 5).map((r, i) => <tr key={i}><td className="px-2 py-1.5 text-slate-500">{i + 1}</td><td className="px-2 py-1.5">{r.studentName || '-'}</td><td className="px-2 py-1.5">{r.amount || '-'}</td></tr>)}
                      </tbody>
                    </table>
                    {importPreview.length > 5 && <div className="p-2 text-center text-xs text-slate-500">... and {importPreview.length - 5} more</div>}
                  </div>
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm">Back</button>
                    <button onClick={executeImport} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1"><CheckIcon size={14} /> Import {importPreview.length}</button>
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

