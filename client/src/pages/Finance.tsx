import { useEffect, useState, useRef } from 'react';
import { Plus, DollarSign, Receipt, FileText, CreditCard, TrendingUp, AlertCircle, Download, ChevronDown, Upload, X, ArrowRight, Check as CheckIcon, Check, Search, Filter } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Fee, Payment, PaymentMethod } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { useCurrency } from '../hooks/useCurrency';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/DataService';

export default function Finance() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments' | 'fees'>('invoices');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ studentId: '', description: '', amount: 0, term: '1', year: new Date().getFullYear().toString() });
  const { addToast } = useToast();
  const { formatMoney, currency } = useCurrency();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importType, setImportType] = useState<'invoices' | 'payments'>('invoices');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerm, setFilterTerm] = useState('all');
  const [showTermFilter, setShowTermFilter] = useState(false);
  const termFilterRef = useRef<HTMLDivElement>(null);

  const students = useActiveStudents();

  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    if (user?.id) {
      loadFees();
      loadPayments();
    }
  }, [user?.id]);

  useEffect(() => {
    const handleFeesUpdated = () => loadFees();
    const handlePaymentsUpdated = () => loadPayments();
    const handleDataRefresh = () => { loadFees(); loadPayments(); };
    
    window.addEventListener('feesUpdated', handleFeesUpdated);
    window.addEventListener('paymentsUpdated', handlePaymentsUpdated);
    window.addEventListener('dataRefresh', handleDataRefresh);
    
    return () => {
      window.removeEventListener('feesUpdated', handleFeesUpdated);
      window.removeEventListener('paymentsUpdated', handlePaymentsUpdated);
      window.removeEventListener('dataRefresh', handleDataRefresh);
    };
  }, []);

  async function loadFees() {
    if (!user?.id) return;
    try {
      const data = await dataService.getAll(user.id, 'fees');
      setFees(data);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadPayments() {
    if (!user?.id) return;
    try {
      const data = await dataService.getAll(user.id, 'payments');
      setPayments(data);
    } catch (error) {
      console.error(error);
    }
  }

  const invoiceExpectedFields = [
    { key: 'studentName', label: 'Student Name', required: true },
    { key: 'description', label: 'Description', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'term', label: 'Term', required: true },
  ];

  const paymentExpectedFields = [
    { key: 'studentName', label: 'Student Name', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'method', label: 'Method', required: false },
    { key: 'date', label: 'Date', required: true },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (termFilterRef.current && !termFilterRef.current.contains(event.target as Node)) {
        setShowTermFilter(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    try {
      const newFee: Fee = { id: uuidv4(), studentId: formData.studentId, description: formData.description, amount: formData.amount, term: formData.term, year: formData.year, createdAt: new Date().toISOString() };
      await dataService.create(user.id, 'fees', newFee as any);
      setShowForm(false);
      setFormData({ studentId: '', description: '', amount: 0, term: '1', year: new Date().getFullYear().toString() });
      addToast('Invoice created successfully', 'success');
    } catch (error) {
      addToast('Failed to create invoice', 'error');
    }
  }

  async function handleRecordPayment(feeId: string, studentId: string, _amount: number) {
    if (!user?.id) return;
    const paymentAmount = prompt('Enter payment amount:');
    if (!paymentAmount || isNaN(parseFloat(paymentAmount))) return;
    
    try {
      const newPayment: Payment = {
        id: uuidv4(),
        feeId,
        studentId,
        amount: parseFloat(paymentAmount),
        method: PaymentMethod.CASH,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await dataService.create(user.id, 'payments', newPayment as any);
      addToast('Payment recorded successfully', 'success');
    } catch (error) {
      addToast('Failed to record payment', 'error');
    }
  }

  function handleExportInvoicesCSV() {
    const exportData = (fees || []).map(fee => {
      const student = students.find(s => s.id === fee.studentId);
      return { ...fee, studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A' };
    });
    exportToCSV(exportData, 'invoices', [
      { key: 'studentName' as keyof typeof exportData[0], label: 'Student' },
      { key: 'description' as keyof typeof exportData[0], label: 'Description' },
      { key: 'amount' as keyof typeof exportData[0], label: 'Amount' },
      { key: 'term' as keyof typeof exportData[0], label: 'Term' },
      { key: 'year' as keyof typeof exportData[0], label: 'Year' },
    ]);
    addToast('Invoices exported to CSV', 'success');
    setShowExportMenu(false);
  }

  function handleExportPaymentsCSV() {
    const exportData = (payments || []).map(payment => {
      const student = students.find(s => s.id === payment.studentId);
      return { ...payment, studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A' };
    });
    exportToCSV(exportData, 'payments', [
      { key: 'studentName' as keyof typeof exportData[0], label: 'Student' },
      { key: 'amount' as keyof typeof exportData[0], label: 'Amount' },
      { key: 'method' as keyof typeof exportData[0], label: 'Method' },
      { key: 'date' as keyof typeof exportData[0], label: 'Date' },
    ]);
    addToast('Payments exported to CSV', 'success');
    setShowExportMenu(false);
  }

  function handleExportInvoicesPDF() {
    const exportData = (fees || []).map(fee => {
      const student = students.find(s => s.id === fee.studentId);
      const studentPayments = (payments || []).filter(p => p.feeId === fee.id);
      const paidAmount = studentPayments.reduce((sum, p) => sum + p.amount, 0);
      const status = paidAmount >= fee.amount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';
      return {
        ...fee,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A',
        status
      };
    });
    exportToPDF('Invoices Report', exportData, [
      { key: 'studentName', label: 'Student' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount' },
      { key: 'term', label: 'Term' },
      { key: 'status', label: 'Status' },
    ], 'invoices');
    addToast('Invoices exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportPaymentsPDF() {
    const exportData = (payments || []).map(payment => {
      const student = students.find(s => s.id === payment.studentId);
      return {
        ...payment,
        studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A',
        date: new Date(payment.date).toLocaleDateString()
      };
    });
    exportToPDF('Payments Report', exportData, [
      { key: 'studentName', label: 'Student' },
      { key: 'amount', label: 'Amount' },
      { key: 'method', label: 'Method' },
      { key: 'date', label: 'Date' },
    ], 'payments');
    addToast('Payments exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportInvoicesExcel() {
    const exportData = (fees || []).map(fee => {
      const student = students.find(s => s.id === fee.studentId);
      return { ...fee, studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A' };
    });
    exportToExcel(exportData, 'invoices', [
      { key: 'studentName' as keyof typeof exportData[0], label: 'Student' },
      { key: 'description' as keyof typeof exportData[0], label: 'Description' },
      { key: 'amount' as keyof typeof exportData[0], label: 'Amount' },
      { key: 'term' as keyof typeof exportData[0], label: 'Term' },
    ]);
    addToast('Invoices exported to Excel', 'success');
    setShowExportMenu(false);
  }

  function handleExportPaymentsExcel() {
    const exportData = (payments || []).map(payment => {
      const student = students.find(s => s.id === payment.studentId);
      return { ...payment, studentName: student ? `${student.firstName} ${student.lastName}` : 'N/A' };
    });
    exportToExcel(exportData, 'payments', [
      { key: 'studentName' as keyof typeof exportData[0], label: 'Student' },
      { key: 'amount' as keyof typeof exportData[0], label: 'Amount' },
      { key: 'method' as keyof typeof exportData[0], label: 'Method' },
      { key: 'date' as keyof typeof exportData[0], label: 'Date' },
    ]);
    addToast('Payments exported to Excel', 'success');
    setShowExportMenu(false);
  }

  function downloadTemplate() {
    const fields = importType === 'invoices' ? invoiceExpectedFields : paymentExpectedFields;
    const headers = fields.map(f => f.label);
    const sampleRows = importType === 'invoices'
      ? [['John Doe', 'Term 1 Tuition', '50000', '1']]
      : [['John Doe', '50000', 'cash', '2024-01-15']];
    const csv = [headers.join(','), ...sampleRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${importType}-import-template.csv`;
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
      const fields = importType === 'invoices' ? invoiceExpectedFields : paymentExpectedFields;
      const autoMapping: Record<string, string> = {};
      fields.forEach(field => {
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
    const fields = importType === 'invoices' ? invoiceExpectedFields : paymentExpectedFields;
    const mappedData: any[] = [];
    for (const row of csvData) {
      const record: any = {};
      fields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            record[field.key] = row[headerIndex];
          }
        }
      });
      if ((importType === 'invoices' && record.description && record.amount) ||
          (importType === 'payments' && record.studentName && record.amount)) {
        mappedData.push(record);
      }
    }
    setImportPreview(mappedData);
    setImportStep('preview');
  }

  async function executeImport() {
    if (importPreview.length === 0 || !user?.id) { addToast('No valid records to import', 'error'); return; }
    try {
      const now = new Date().toISOString();
      let successCount = 0;

      if (importType === 'invoices') {
        for (const data of importPreview) {
          const student = students.find(s => `${s.firstName} ${s.lastName}` === data.studentName);
          if (!student) continue;
          const fee: Fee = {
            id: uuidv4(),
            studentId: student.id,
            description: data.description,
            amount: parseFloat(data.amount),
            term: data.term || '1',
            year: new Date().getFullYear().toString(),
            createdAt: now,
          };
          await dataService.create(user.id, 'fees', fee as any);
          successCount++;
        }
      } else {
        for (const data of importPreview) {
          const student = students.find(s => `${s.firstName} ${s.lastName}` === data.studentName);
          if (!student) continue;
          const payment: Payment = {
            id: uuidv4(),
            feeId: '',
            studentId: student.id,
            amount: parseFloat(data.amount),
            method: (data.method as PaymentMethod) || PaymentMethod.CASH,
            date: data.date || now,
            createdAt: now,
          };
          await dataService.create(user.id, 'payments', payment as any);
          successCount++;
        }
      }
      addToast(`Successfully imported ${successCount} ${importType}`, 'success');
      closeImportModal();
    } catch (error) { addToast('Failed to import', 'error'); }
  }

  const totalCollected = (payments || []).reduce((sum, p) => sum + p.amount, 0);
  const totalInvoiced = (fees || []).reduce((sum, f) => sum + f.amount, 0);
  const totalPending = totalInvoiced - totalCollected;

  const tabs = [
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'payments', label: 'Payments', icon: Receipt },
    { id: 'fees', label: 'Fee Structure', icon: DollarSign },
  ];

  const filteredFees = (fees || []).filter(fee => {
    const student = students.find(s => s.id === fee.studentId);
    const search = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      fee.description.toLowerCase().includes(search) ||
      (student ? `${student.firstName} ${student.lastName}`.toLowerCase().includes(search) : false);
    const matchesTerm = filterTerm === 'all' || fee.term === filterTerm;
    return matchesSearch && matchesTerm;
  });

  const filteredPayments = (payments || []).filter(payment => {
    const student = students.find(s => s.id === payment.studentId);
    const search = searchTerm.toLowerCase();
    return !searchTerm || 
      (student ? `${student.firstName} ${student.lastName}`.toLowerCase().includes(search) : false) ||
      payment.method.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Finance Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track fees, invoices, and payments</p>
        </div>
        <div className="flex items-center gap-2">
          {(activeTab === 'invoices' || activeTab === 'fees') && (
            <>
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
                      onClick={handleExportInvoicesPDF}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <FileText size={14} />
                      Export PDF
                    </button>
                    <button
                      onClick={handleExportInvoicesCSV}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Download size={14} />
                      Export CSV
                    </button>
                    <button
                      onClick={handleExportInvoicesExcel}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <FileText size={14} />
                      Export Excel
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => { setImportType('invoices'); setShowImportModal(true); fileInputRef.current?.click(); }} className="btn btn-secondary" title="Import">
                <Upload size={16} />
                <span className="hidden sm:inline">Import</span>
              </button>
            </>
          )}
          {activeTab === 'payments' && (
            <>
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
                      onClick={handleExportPaymentsPDF}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <FileText size={14} />
                      Export PDF
                    </button>
                    <button
                      onClick={handleExportPaymentsCSV}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Download size={14} />
                      Export CSV
                    </button>
                    <button
                      onClick={handleExportPaymentsExcel}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <FileText size={14} />
                      Export Excel
                    </button>
                  </div>
                )}
              </div>
              <button onClick={() => { setImportType('payments'); setShowImportModal(true); fileInputRef.current?.click(); }} className="btn btn-secondary" title="Import">
                <Upload size={16} />
                <span className="hidden sm:inline">Import</span>
              </button>
            </>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".csv"
            className="hidden"
          />
          {activeTab === 'invoices' && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary">
              <Plus size={16} />
              Create Invoice
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <TrendingUp size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Collected</p>
              <p className="text-2xl font-bold text-white">{formatMoney(totalCollected)}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-rose p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <AlertCircle size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Pending</p>
              <p className="text-2xl font-bold text-white">{formatMoney(totalPending)}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <FileText size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Invoiced</p>
              <p className="text-2xl font-bold text-white">{formatMoney(totalInvoiced)}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-violet p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Receipt size={24} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Transactions</p>
              <p className="text-2xl font-bold text-white">{(payments || []).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Form */}
      {showForm && (
        <div className="card border-l-4 border-l-violet-500">
          <div className="card-header">
            <h3 className="font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-2">
              <Plus size={18} />
              Create New Invoice
            </h3>
          </div>
          <form onSubmit={handleCreateInvoice} className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Student</label>
              <select value={formData.studentId} onChange={e => setFormData(prev => ({ ...prev, studentId: e.target.value }))} className="form-input" required>
                <option value="">Select Student</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.admissionNo})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Description</label>
              <input value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} className="form-input" required placeholder="Term 1 Tuition" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Amount ({currency.symbol})</label>
              <input type="number" value={formData.amount} onChange={e => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))} className="form-input" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="form-label">Term</label>
                <select value={formData.term} onChange={e => setFormData(prev => ({ ...prev, term: e.target.value }))} className="form-input">
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Year</label>
                <input type="number" value={formData.year} onChange={e => setFormData(prev => ({ ...prev, year: e.target.value }))} className="form-input" />
              </div>
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" className="btn btn-primary">Create Invoice</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Main Card with Tabs */}
      <div className="card">
        <div className="card-header">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative" ref={termFilterRef}>
                <button
                  onClick={() => setShowTermFilter(!showTermFilter)}
                  className={`btn btn-secondary flex items-center gap-2 ${filterTerm !== 'all' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700' : ''}`}
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">
                    {filterTerm === 'all' ? 'All Terms' : `Term ${filterTerm}`}
                  </span>
                  <span className="sm:hidden">Terms</span>
                  <ChevronDown size={14} className={`transition-transform duration-300 ${showTermFilter ? 'rotate-180' : ''}`} />
                </button>
                {showTermFilter && (
                  <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-dropdown-in">
                    <div className="py-1">
                      <button
                        onClick={() => { setFilterTerm('all'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === 'all' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        All Terms
                        {filterTerm === 'all' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterTerm('1'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === '1' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        Term 1
                        {filterTerm === '1' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterTerm('2'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === '2' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        Term 2
                        {filterTerm === '2' && <Check size={14} className="ml-auto" />}
                      </button>
                      <button
                        onClick={() => { setFilterTerm('3'); setShowTermFilter(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          filterTerm === '3' ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        Term 3
                        {filterTerm === '3' && <Check size={14} className="ml-auto" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <Search size={18} className="search-input-icon" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="search-input w-48"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                {activeTab === 'invoices' && <><th>Student</th><th>Description</th><th>Amount</th><th>Term</th><th>Status</th><th>Actions</th></>}
                {activeTab === 'payments' && <><th>Date</th><th>Student</th><th>Amount</th><th>Method</th></>}
                {activeTab === 'fees' && <><th>Description</th><th>Amount</th><th>Term</th></>}
              </tr>
            </thead>
            <tbody>
              {!fees || !payments ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-sm">Loading...</p>
                    </div>
                  </td>
                </tr>
              ) : activeTab === 'invoices' && filteredFees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                        <FileText size={24} className="text-violet-400" />
                      </div>
                      <p className="text-slate-500 font-medium">No invoices yet</p>
                      <button onClick={() => setShowForm(true)} className="text-blue-500 hover:text-blue-600 text-sm font-medium">
                        Create your first invoice
                      </button>
                    </div>
                  </td>
                </tr>
              ) : activeTab === 'payments' && filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <Receipt size={24} className="text-green-400" />
                      </div>
                      <p className="text-slate-500 font-medium">No payments recorded</p>
                      <p className="text-slate-400 text-sm">Record payments from invoices tab</p>
                    </div>
                  </td>
                </tr>
              ) : activeTab === 'fees' && filteredFees.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <DollarSign size={24} className="text-amber-400" />
                      </div>
                      <p className="text-slate-500 font-medium">No fee structure set</p>
                      <p className="text-slate-400 text-sm">Create invoices to set up fees</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {activeTab === 'invoices' && filteredFees.map(fee => {
                    const student = students.find(s => s.id === fee.studentId);
                    const studentPayments = payments.filter(p => p.feeId === fee.id);
                    const paidAmount = studentPayments.reduce((sum, p) => sum + p.amount, 0);
                    const status = paidAmount >= fee.amount ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';
                    const statusColors: Record<string, string> = {
                      Paid: 'badge-success',
                      Partial: 'badge-warning',
                      Pending: 'badge-danger',
                    };
                    return (
                      <tr key={fee.id}>
                        <td className="font-medium">{student ? `${student.firstName} ${student.lastName}` : <span className="text-slate-400">N/A</span>}</td>
                        <td>{fee.description}</td>
                        <td className="font-semibold">{formatMoney(fee.amount)}</td>
                        <td><span className="badge badge-info">Term {fee.term}</span></td>
                        <td><span className={`badge ${statusColors[status]}`}>{status}</span></td>
                        <td>
                          {status !== 'Paid' && (
                            <button onClick={() => handleRecordPayment(fee.id, fee.studentId!, fee.amount - paidAmount)} className="btn btn-secondary text-xs py-1.5">
                              <CreditCard size={12} /> Record
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {activeTab === 'payments' && filteredPayments.map(payment => {
                    const student = students.find(s => s.id === payment.studentId);
                    return (
                      <tr key={payment.id}>
                        <td className="text-slate-500">{new Date(payment.date).toLocaleDateString()}</td>
                        <td className="font-medium">{student ? `${student.firstName} ${student.lastName}` : 'N/A'}</td>
                        <td className="font-bold text-green-600 dark:text-green-400">{formatMoney(payment.amount)}</td>
                        <td>
                          <span className="badge badge-info capitalize">{payment.method.replace('_', ' ')}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {activeTab === 'fees' && [...new Set(filteredFees.map(f => f.description))].map(desc => {
                    const fee = filteredFees.find(f => f.description === desc);
                    const relatedFees = filteredFees.filter(f => f.description === desc);
                    const totalAmount = relatedFees.reduce((sum, f) => sum + f.amount, 0);
                    return (
                      <tr key={desc}>
                        <td className="font-medium">{desc}</td>
                        <td>{formatMoney(totalAmount)}</td>
                        <td><span className="badge badge-info">Term {fee?.term}</span></td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-backdrop-in" onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import {importType === 'invoices' ? 'Invoices' : 'Payments'}</h2>
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
                      {(importType === 'invoices' ? invoiceExpectedFields : paymentExpectedFields).map(field => (
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
                        {(importType === 'invoices' ? invoiceExpectedFields : paymentExpectedFields).filter(f => f.required).map(field => (
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
                      <strong>{importPreview.length}</strong> {importType} ready to import
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
                            <td className="px-2 py-1.5">{record.studentName || record.description || '-'}</td>
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
      )}
    </div>
  );
}
