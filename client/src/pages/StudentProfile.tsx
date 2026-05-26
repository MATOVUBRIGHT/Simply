import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, User,
  GraduationCap, BookOpen, CreditCard, FileText, CheckCircle, AlertCircle,
  Clock, Receipt, BarChart2, Printer, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Student, Class } from '@schofy/shared';
import ImageModal from '../components/ImageModal';
import DropdownModal from '../components/DropdownModal';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { useCurrency } from '../hooks/useCurrency';
import { v4 as uuidv4 } from 'uuid';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
];

export default function StudentProfile() {
  const { id } = useParams();
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const sid = schoolId || user?.id || '';

  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [updatingClass, setUpdatingClass] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'fees' | 'reports' | 'ledger' | 'more'>('info');
  const [expandedFee, setExpandedFee] = useState<string | null>(null);

  // Pay modal state
  const [showPayModal, setShowPayModal] = useState<{ feeId: string; remaining: number; desc: string } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);

  const { data: studentsData, loading } = useTableData(sid, 'students');
  const { data: classesData } = useTableData(sid, 'classes');
  const { data: feesData } = useTableData(sid, 'fees');
  const { data: paymentsData } = useTableData(sid, 'payments');
  const { data: bursariesData } = useTableData(sid, 'bursaries');
  const { data: discountsData } = useTableData(sid, 'discounts');
  const { data: examResultsData } = useTableData(sid, 'examResults');
  const { data: examsData } = useTableData(sid, 'exams');
  const { data: attendanceData } = useTableData(sid, 'attendance');
  const { data: settingsData } = useTableData(sid, 'settings');

  const student = useMemo(() =>
    (studentsData.find((s: any) => s.id === id) as Student) || null,
    [studentsData, id]);
  const classes = classesData as Class[];

  // ── Fee calculations ────────────────────────────────────────────────────────
  const studentFees = useMemo(() =>
    feesData.filter((f: any) => f.studentId === id),
    [feesData, id]);

  const feeRows = useMemo(() =>
    studentFees.map((fee: any) => {
      const feePayments = [...paymentsData.filter((p: any) => p.feeId === fee.id)]
        .sort((a: any, b: any) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
      const paid = feePayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const remaining = Math.max(0, (fee.amount || 0) - paid);
      const status: 'paid' | 'partial' | 'pending' = remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
      return { ...fee, paid, remaining, status, payments: feePayments };
    }),
    [studentFees, paymentsData]);

  const totalInvoiced = feeRows.reduce((s: number, f: any) => s + (f.amount || 0), 0);
  const totalPaid = feeRows.reduce((s: number, f: any) => s + f.paid, 0);
  const totalBalance = Math.max(0, totalInvoiced - totalPaid);
  const settingsMap = useMemo(() => {
    const obj: Record<string, any> = {};
    (settingsData as any[]).forEach((row: any) => { obj[row.key] = row.value; });
    return obj;
  }, [settingsData]);
  const currentTerm = settingsMap.currentTerm || '1';
  const currentYear = settingsMap.academicYear || String(new Date().getFullYear());
  const studentBursaries = useMemo(() => (bursariesData as any[]).filter((b: any) => b.studentId === id && String(b.term) === String(currentTerm) && String(b.year) === String(currentYear)), [bursariesData, id, currentTerm, currentYear]);
  const studentDiscounts = useMemo(() => (discountsData as any[]).filter((d: any) => d.studentId === id && String(d.term) === String(currentTerm) && String(d.year) === String(currentYear)), [discountsData, id, currentTerm, currentYear]);
  const previousFees = useMemo(() => studentFees.filter((fee: any) => {
    const feeYear = Number(fee.year || 0);
    const selectedYear = Number(currentYear || 0);
    const feeTerm = Number(String(fee.term || '').replace(/[^0-9]/g, '')) || 0;
    const selectedTerm = Number(String(currentTerm || '').replace(/[^0-9]/g, '')) || 0;
    return feeYear < selectedYear || (feeYear === selectedYear && feeTerm < selectedTerm);
  }), [studentFees, currentTerm, currentYear]);
  const currentTermFees = useMemo(() => studentFees.filter((fee: any) => String(fee.term) === String(currentTerm) && String(fee.year) === String(currentYear)), [studentFees, currentTerm, currentYear]);
  const previousFeeIds = useMemo(() => new Set(previousFees.map((fee: any) => fee.id)), [previousFees]);
  const currentTermInvoiced = currentTermFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
  const currentTermPaid = paymentsData
    .filter((payment: any) => currentTermFees.some((fee: any) => fee.id === payment.feeId))
    .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  const openingBalance = Math.max(0, previousFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0) - paymentsData.filter((payment: any) => previousFeeIds.has(payment.feeId)).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0));
  const currentTermTotal = openingBalance + currentTermInvoiced;
  const hasFullBursary = studentBursaries.some((b: any) => b.isFull);
  const bursaryAmount = studentBursaries.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);
  const discountAmount = studentDiscounts.filter((d: any) => d.type !== 'percentage').reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const discountPercent = studentDiscounts.filter((d: any) => d.type === 'percentage').reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);
  const overallStatus: 'paid' | 'partial' | 'pending' | 'none' =
    feeRows.length === 0 ? 'none' : totalBalance <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'pending';

  // ── Exam results — one academic document per exam ─────────────────────────
  const studentResults = useMemo(() =>
    examResultsData.filter((r: any) => r.studentId === id),
    [examResultsData, id]);

  const examsWithResults = useMemo(() => {
    const examMap = new Map<string, { exam: any; results: any[] }>();

    studentResults.forEach((r: any) => {
      const exam = examsData.find((e: any) => e.id === r.examId) as any;
      if (!exam) return;
      if (!examMap.has(exam.id)) {
        examMap.set(exam.id, { exam, results: [] });
      }
      examMap.get(exam.id)!.results.push(r);
    });

    return Array.from(examMap.values())
      .sort((a, b) => {
        if (String(b.exam.year) !== String(a.exam.year)) return String(b.exam.year).localeCompare(String(a.exam.year));
        if (String(b.exam.term) !== String(a.exam.term)) return String(b.exam.term).localeCompare(String(a.exam.term));
        return String(b.exam.name).localeCompare(String(a.exam.name));
      })
      .map(entry => ({
        exam: entry.exam,
        exams: [entry.exam],
        results: entry.results,
        term: entry.exam.term,
        year: entry.exam.year,
        label: entry.exam.name,
      }));
  }, [studentResults, examsData]);

  // ── Attendance ──────────────────────────────────────────────────────────────
  const attendanceSummary = useMemo(() => {
    const records = attendanceData.filter((a: any) => a.entityId === id && a.entityType === 'student');
    const present = records.filter((a: any) => a.status === 'present').length;
    const absent = records.filter((a: any) => a.status === 'absent').length;
    const late = records.filter((a: any) => a.status === 'late').length;
    const total = records.length;
    return { present, absent, late, total, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
  }, [attendanceData, id]);

  async function handleClassChange(newClassId: string) {
    const authId = schoolId || user?.id;
    if (!authId || !student || student.classId === newClassId) { setShowClassDropdown(false); return; }
    setUpdatingClass(true);
    try {
      await dataService.update(authId, 'students', student.id, { classId: newClassId, updatedAt: new Date().toISOString() } as any);
      addToast('Class updated', 'success');
    } catch { addToast('Failed to update class', 'error'); }
    finally { setUpdatingClass(false); setShowClassDropdown(false); }
  }

  function openPayModal(fee: any) {
    setShowPayModal({ feeId: fee.id, remaining: fee.remaining, desc: fee.description });
    setPayAmount(String(fee.remaining));
    setPayMethod('cash');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNote('');
  }

  async function handleRecordPayment() {
    if (!showPayModal || !id) return;
    if (paying) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0 || amount > showPayModal.remaining) {
      addToast(`Enter a valid amount (max ${formatMoney(showPayModal.remaining)})`, 'error');
      return;
    }
    setPaying(true);
    try {
      await dataService.create(sid, 'payments', {
        id: uuidv4(),
        feeId: showPayModal.feeId,
        studentId: id,
        amount,
        method: payMethod,
        date: new Date(payDate).toISOString(),
        notes: payNote || undefined,
        createdAt: new Date().toISOString(),
      } as any);
      addToast('Payment recorded', 'success');
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'payments' } }));
      setShowPayModal(null);
    } catch { addToast('Failed to record payment', 'error'); }
    finally { setPaying(false); }
  }

  function getClassName(classId: string) {
    return classes.find(c => c.id === classId)?.name || classId;
  }

  function fmtDate(d: string) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  }

  const statusBadge: Record<string, string> = {
    paid: 'badge-success', partial: 'badge-warning', pending: 'badge-danger', none: 'badge-gray',
  };
  const statusIcon: Record<string, any> = {
    paid: CheckCircle, partial: Clock, pending: AlertCircle, none: Receipt,
  };
  const StatusIcon = statusIcon[overallStatus] || Receipt;
  const statusLabel: Record<string, string> = { paid: 'Paid', partial: 'Partial', pending: 'Pending', none: 'No Invoice' };
  const profileCustomFields = useMemo(() => Array.isArray((student as any)?.customFields) ? (student as any).customFields.filter((field: any) => field?.label) : [], [student]);
  const registeredRequirements = useMemo(() => Array.isArray((student as any)?.requirements) ? (student as any).requirements.filter(Boolean) : [], [student]);
  const registeredAttachments = useMemo(() => Array.isArray((student as any)?.attachments) ? (student as any).attachments.filter((item: any) => item?.name || item?.file) : [], [student]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
    </div>
  );

  if (!student) return (
    <div className="text-center py-12">
      <p className="text-slate-500">Student not found</p>
      <Link to="/students" className="btn btn-primary mt-4">Back to Students</Link>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/students" className="btn btn-ghost p-2"><ArrowLeft size={20} /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{student.firstName} {student.lastName}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <p className="text-sm text-slate-500">ID: {student.studentId || student.admissionNo} · {getClassName(student.classId)}</p>
            {hasFullBursary && <span className="badge badge-success">Full bursary</span>}
            {!hasFullBursary && bursaryAmount > 0 && <span className="badge badge-warning">On bursary: {formatMoney(bursaryAmount)}</span>}
            {studentDiscounts.length > 0 && <span className="badge badge-info">Discount: {discountPercent > 0 ? `${discountPercent}%` : formatMoney(discountAmount)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setActiveTab('fees')} className="btn btn-secondary"><Receipt size={18} /> Invoice</button>
          <button type="button" onClick={() => setActiveTab('ledger')} className="btn btn-secondary"><FileText size={18} /> Ledger</button>
          <Link to={`/students/${student.id}/edit`} className="btn btn-primary"><Edit size={18} />Edit</Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['info', 'fees', 'reports', 'ledger', 'more'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            {tab === 'fees' ? 'Fees & Payments' : tab === 'reports' ? 'Academic Documents' : tab === 'ledger' ? 'Ledger' : tab === 'more' ? 'More' : 'Profile'}
          </button>
        ))}
      </div>

      {/* ── PROFILE TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="card">
              <div className="card-body text-center">
                {student.photoUrl ? (
                  <button onClick={() => setPreviewImage({ src: student.photoUrl!, alt: `${student.firstName} ${student.lastName}` })} className="mx-auto mb-4 block">
                    <img src={student.photoUrl} alt={`${student.firstName} ${student.lastName}`}
                      className="w-24 h-24 rounded-full object-cover object-top shadow-lg hover:ring-4 hover:ring-primary-500/30 transition-all cursor-pointer mx-auto" />
                  </button>
                ) : (
                  <div className="w-24 h-24 mx-auto rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
                    <span className="text-3xl font-bold text-primary-600 dark:text-primary-400">{student.firstName[0]}{student.lastName[0]}</span>
                  </div>
                )}
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">{student.firstName} {student.lastName}</h2>
                <p className="text-slate-500 capitalize">{student.gender}</p>
                <span className={`badge mt-3 ${student.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{student.status}</span>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="font-semibold">Contact</h3></div>
              <div className="card-body space-y-3">
                <div className="flex items-center gap-3"><Phone size={16} className="text-slate-400" /><div><p className="text-xs text-slate-500">Phone</p><p className="text-sm">{student.guardianPhone || 'N/A'}</p></div></div>
                <div className="flex items-center gap-3"><Mail size={16} className="text-slate-400" /><div><p className="text-xs text-slate-500">Email</p><p className="text-sm">{student.guardianEmail || 'N/A'}</p></div></div>
                <div className="flex items-start gap-3"><MapPin size={16} className="text-slate-400 mt-0.5" /><div><p className="text-xs text-slate-500">Address</p><p className="text-sm">{student.address || 'N/A'}</p></div></div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="card">
              <div className="card-header"><h3 className="font-semibold">Personal Information</h3></div>
              <div className="card-body grid grid-cols-2 md:grid-cols-3 gap-5">
                <div><p className="text-xs text-slate-500 mb-1">Date of Birth</p><div className="flex items-center gap-2"><Calendar size={14} className="text-slate-400" /><p className="text-sm font-medium">{student.dob ? new Date(student.dob).toLocaleDateString() : 'N/A'}</p></div></div>
                <div><p className="text-xs text-slate-500 mb-1">Gender</p><div className="flex items-center gap-2"><User size={14} className="text-slate-400" /><p className="text-sm font-medium capitalize">{student.gender}</p></div></div>
                <div><p className="text-xs text-slate-500 mb-1">Class</p><div className="flex items-center gap-2"><GraduationCap size={14} className="text-slate-400" /><p className="text-sm font-medium">{getClassName(student.classId)}</p></div></div>
                <div><p className="text-xs text-slate-500 mb-1">ID Number</p><p className="text-sm font-medium font-mono">{student.studentId || student.admissionNo || 'N/A'}</p></div>
                <div><p className="text-xs text-slate-500 mb-1">Fee Status</p>
                  <span className={`badge ${statusBadge[overallStatus]}`}>{statusLabel[overallStatus]}</span>
                </div>
                <div><p className="text-xs text-slate-500 mb-1">Finance Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hasFullBursary && <span className="badge badge-success">Full bursary</span>}
                    {!hasFullBursary && bursaryAmount > 0 && <span className="badge badge-warning">Bursary {formatMoney(bursaryAmount)}</span>}
                    {studentDiscounts.length > 0 && <span className="badge badge-info">Discount {discountPercent > 0 ? `${discountPercent}%` : formatMoney(discountAmount)}</span>}
                    {!studentBursaries.length && !studentDiscounts.length && <span className="text-sm text-slate-400">None</span>}
                  </div>
                </div>
                <div><p className="text-xs text-slate-500 mb-1">Status</p><span className={`badge ${student.status === 'active' ? 'badge-success' : 'badge-gray'}`}>{student.status}</span></div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3 className="font-semibold">Guardian Details</h3></div>
              <div className="card-body">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><User size={20} className="text-slate-500" /></div>
                  <div><p className="font-medium text-slate-800 dark:text-white">{student.guardianName || 'N/A'}</p><p className="text-sm text-slate-500">Primary Guardian</p></div>
                </div>
              </div>
            </div>
            {student.medicalInfo && (
              <div className="card">
                <div className="card-header"><h3 className="font-semibold">Medical Information</h3></div>
                <div className="card-body"><p className="text-sm text-slate-600 dark:text-slate-400">{student.medicalInfo}</p></div>
              </div>
            )}
            <div className="card">
              <button onClick={() => setShowClassDropdown(true)} disabled={updatingClass}
                className="w-full card-body flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-700"><GraduationCap size={22} className="text-slate-600 dark:text-slate-300" /></div>
                <div className="flex-1"><p className="text-xs text-slate-500">Class</p><p className="text-base font-bold text-slate-800 dark:text-white">{updatingClass ? 'Updating...' : getClassName(student.classId)}</p></div>
                <BookOpen size={18} className="text-slate-400" />
              </button>
            </div>
            <DropdownModal isOpen={showClassDropdown} onClose={() => setShowClassDropdown(false)} title="Change Class" icon={<GraduationCap size={20} />}>
              <div className="p-2">
                {classes.map(cls => (
                  <button key={cls.id} onClick={() => handleClassChange(cls.id)}
                    className={`w-full px-4 py-3 text-left rounded-lg transition-colors flex items-center justify-between ${student.classId === cls.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                    <div className="flex items-center gap-3"><BookOpen size={16} className={student.classId === cls.id ? 'text-primary-500' : 'text-slate-400'} /><span className="font-medium">{cls.name}</span></div>
                    {student.classId === cls.id && <span className="text-xs bg-primary-100 dark:bg-primary-800 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full">Current</span>}
                  </button>
                ))}
              </div>
            </DropdownModal>
          </div>
        </div>
      )}

      {activeTab === 'more' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <FileText size={18} className="text-indigo-500" />
              <h3 className="font-semibold">Registered Documents</h3>
            </div>
            <div className="card-body space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Admission requirements</p>
                {registeredRequirements.length === 0 ? (
                  <p className="text-sm text-slate-400">No admission requirements registered.</p>
                ) : (
                  <ol className="space-y-2">
                    {registeredRequirements.map((requirement: string, index: number) => (
                      <li key={`${requirement}-${index}`} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">{index + 1}</span>
                        <span className="text-slate-700 dark:text-slate-200">{requirement}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Attached files</p>
                {registeredAttachments.length === 0 ? (
                  <p className="text-sm text-slate-400">No attached documents registered.</p>
                ) : (
                  <ol className="space-y-2">
                    {registeredAttachments.map((attachment: any, index: number) => (
                      <li key={attachment.id || `${attachment.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm dark:border-slate-700 dark:bg-slate-800">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{index + 1}</span>
                        <FileText size={15} className="text-slate-400" />
                        {attachment.file ? (
                          <a href={attachment.file} download={attachment.name || 'student-document'} className="font-medium text-primary-600 hover:underline dark:text-primary-300">
                            {attachment.name || `Document ${index + 1}`}
                          </a>
                        ) : (
                          <span className="font-medium text-slate-700 dark:text-slate-200">{attachment.name || `Document ${index + 1}`}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <User size={18} className="text-violet-500" />
              <h3 className="font-semibold">Custom Fields</h3>
            </div>
            <div className="card-body">
              {profileCustomFields.length === 0 ? (
                <p className="text-sm text-slate-400">No custom profile fields registered.</p>
              ) : (
                <ol className="grid grid-cols-1 gap-3">
                  {profileCustomFields.map((field: any, index: number) => (
                    <li key={field.id || `${field.label}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{field.label}</p>
                          <p className="mt-1 break-words text-sm font-medium text-slate-800 dark:text-slate-100">{field.value || 'N/A'}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── FEES TAB ────────────────────────────────────────────────────────── */}
      {activeTab === 'fees' && (
        <div className="space-y-5">
          {/* Summary — plain white cards, status shown as badge only */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-slate-500 mb-1">Current Term {currentTerm}</p>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-300">{formatMoney(currentTermTotal)}</p>
              {openingBalance > 0 && <p className="mt-1 text-[11px] font-semibold text-pink-600 dark:text-pink-300">Includes {formatMoney(openingBalance)} opening top-up</p>}
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 mb-1">All Invoiced</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{formatMoney(totalInvoiced)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 mb-1">Balance Due</p>
              <p className={`text-xl font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatMoney(totalBalance)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500 mb-1">Fee Status</p>
              <div className="flex items-center gap-2 mt-1">
                <StatusIcon size={16} className={overallStatus === 'paid' ? 'text-emerald-500' : overallStatus === 'partial' ? 'text-amber-500' : overallStatus === 'pending' ? 'text-red-500' : 'text-slate-400'} />
                <span className={`badge ${statusBadge[overallStatus]}`}>{statusLabel[overallStatus]}</span>
              </div>
            </div>
          </div>

          {feeRows.length === 0 ? (
            <div className="card p-10 text-center">
              <Receipt size={36} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No invoices yet</p>
              <p className="text-sm text-slate-400 mt-1">Go to Invoices to generate fees for this student</p>
              <Link to="/invoices" className="btn btn-primary mt-4 inline-flex">Go to Invoices</Link>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="card-header"><h3 className="font-semibold">Fee Breakdown</h3></div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {feeRows.map((fee: any) => (
                  <div key={fee.id}>
                    {/* Fee row */}
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-800 dark:text-white text-sm">{fee.description}</span>
                          <span className={`badge text-xs ${String(fee.term) === String(currentTerm) && String(fee.year) === String(currentYear) ? 'badge-info' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}>
                            {String(fee.term) === String(currentTerm) && String(fee.year) === String(currentYear) ? `Current Term ${fee.term}` : `Last term ${fee.term}`}
                          </span>
                          <span className={`badge text-xs ${statusBadge[fee.status]}`}>{fee.status}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span>Invoiced: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatMoney(fee.amount)}</span></span>
                          <span>Paid: <span className="font-semibold text-emerald-600">{formatMoney(fee.paid)}</span></span>
                          {fee.remaining > 0 && <span>Balance: <span className="font-semibold text-red-600">{formatMoney(fee.remaining)}</span></span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {fee.remaining > 0 && (
                          <button onClick={() => openPayModal(fee)} className="btn btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                            <CreditCard size={13} /> Pay
                          </button>
                        )}
                        {fee.payments.length > 0 && (
                          <button
                            onClick={() => setExpandedFee(expandedFee === fee.id ? null : fee.id)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                            title="View payment history"
                          >
                            {expandedFee === fee.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Payment history — expandable */}
                    {expandedFee === fee.id && fee.payments.length > 0 && (
                      <div className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment History</p>
                        <div className="space-y-2">
                          {fee.payments.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between text-sm bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-100 dark:border-slate-700">
                              <div className="flex items-center gap-3">
                                <Receipt size={14} className="text-emerald-500 shrink-0" />
                                <div>
                                  <span className="font-semibold text-emerald-600">{formatMoney(p.amount)}</span>
                                  <span className="text-slate-400 mx-2">·</span>
                                  <span className="capitalize text-slate-600 dark:text-slate-300">{(p.method || 'cash').replace('_', ' ')}</span>
                                  {p.notes && <><span className="text-slate-400 mx-2">·</span><span className="text-slate-500 italic text-xs">{p.notes}</span></>}
                                </div>
                              </div>
                              <span className="text-xs text-slate-400 shrink-0">{fmtDate(p.date || p.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REPORTS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div className="space-y-5">
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <BarChart2 size={18} className="text-slate-500" />
              <h3 className="font-semibold">Attendance Summary</h3>
            </div>
            <div className="card-body">
              {attendanceSummary.total === 0 ? (
                <p className="text-sm text-slate-400">No attendance records found.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Present', value: attendanceSummary.present, color: 'text-emerald-600' },
                    { label: 'Absent', value: attendanceSummary.absent, color: 'text-red-600' },
                    { label: 'Late', value: attendanceSummary.late, color: 'text-amber-600' },
                    { label: 'Attendance Rate', value: `${attendanceSummary.rate}%`, color: 'text-slate-800 dark:text-white' },
                  ].map(item => (
                    <div key={item.label} className="card p-4 text-center">
                      <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                      <p className="text-xs text-slate-500 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <FileText size={18} className="text-slate-500" />
              <h3 className="font-semibold">Report Cards</h3>
            </div>
            <div className="card-body">
              {examsWithResults.length === 0 ? (
                <div className="text-center py-6">
                  <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">No exam results found for this student.</p>
                  <Link to="/exam-marks" className="btn btn-secondary mt-3 inline-flex text-sm">Go to Exam Marks</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {examsWithResults.map(({ exam, results, label, term, year }) => {
                    const uniqueSubjects = new Set(results.map((r: any) => r.subjectId || r.subjectName)).size;
                    const scored = results.filter((r: any) => r.score !== null && r.score !== undefined);
                    const avg = scored.length > 0
                      ? Math.round(scored.reduce((s: number, r: any) => s + (Number(r.score) || 0), 0) / scored.length) : 0;
                    return (
                      <div key={exam.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div>
                          <p className="font-semibold text-slate-800 dark:text-white">{label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Separate exam · Term {term} · {year} · {uniqueSubjects} subject{uniqueSubjects !== 1 ? 's' : ''} · Avg: {avg}%
                          </p>
                        </div>
                        <Link to={`/report-card/${student.id}?exam=${exam.id}`} className="btn btn-primary text-sm flex items-center gap-2 shrink-0">
                          <Printer size={15} /> View Report
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Receipt size={18} className="text-slate-500" />
              <h3 className="font-semibold">Fee Statement</h3>
            </div>
            <div className="card-body">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-slate-500">Total invoiced: <span className="font-semibold text-slate-800 dark:text-white">{formatMoney(totalInvoiced)}</span></p>
                  <p className="text-sm text-slate-500">Total paid: <span className="font-semibold text-emerald-600">{formatMoney(totalPaid)}</span></p>
                  {totalBalance > 0 && <p className="text-sm text-slate-500">Balance due: <span className="font-bold text-red-600">{formatMoney(totalBalance)}</span></p>}
                  <div className="pt-1"><span className={`badge ${statusBadge[overallStatus]}`}>{statusLabel[overallStatus]}</span></div>
                </div>
                {totalBalance > 0 && (
                  <button onClick={() => setActiveTab('fees')} className="btn btn-primary flex items-center gap-2">
                    <CreditCard size={16} /> Pay Now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="space-y-5">
          <div className="card overflow-hidden">
            <div className="card-header flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">{student.firstName} {student.lastName} Ledger</h3>
                <p className="text-sm text-slate-500">Current Term {currentTerm}, {currentYear}</p>
              </div>
              <button type="button" onClick={() => setActiveTab('info')} className="btn btn-secondary">
                <ArrowLeft size={16} /> Back to Profile
              </button>
            </div>
            <div className="card-body space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Opening Balance', value: openingBalance, color: openingBalance > 0 ? 'text-pink-600 dark:text-pink-300' : 'text-slate-700 dark:text-slate-200' },
                  { label: `Current Term ${currentTerm}`, value: currentTermTotal, color: 'text-indigo-600 dark:text-indigo-300' },
                  { label: 'Current Paid', value: currentTermPaid, color: 'text-emerald-600 dark:text-emerald-300' },
                  { label: 'All Paid', value: totalPaid, color: 'text-emerald-600 dark:text-emerald-300' },
                  { label: 'Balance', value: totalBalance, color: totalBalance > 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <p className="text-[11px] font-semibold uppercase text-slate-400">{item.label}</p>
                    <p className={`mt-1 text-lg font-bold ${item.color}`}>{formatMoney(item.value)}</p>
                  </div>
                ))}
              </div>

              {openingBalance > 0 && (
                <div className="rounded-xl border border-pink-200 bg-pink-50 p-3 text-sm text-pink-700 dark:border-pink-900/50 dark:bg-pink-900/20 dark:text-pink-300">
                  Opening balance top-up of <strong>{formatMoney(openingBalance)}</strong> is carried into Current Term {currentTerm}.
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">Ledger Items</p>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>No.</th><th>Description</th><th>Term</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {openingBalance > 0 && (
                        <tr className="bg-pink-50/80 dark:bg-pink-900/10">
                          <td>1</td>
                          <td className="font-medium">Opening balance top-up</td>
                          <td><span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">Current Term {currentTerm}</span></td>
                          <td>{formatMoney(openingBalance)}</td>
                          <td>{formatMoney(0)}</td>
                          <td className="font-semibold text-pink-600 dark:text-pink-300">{formatMoney(openingBalance)}</td>
                          <td><span className="badge bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">top-up</span></td>
                        </tr>
                      )}
                      {currentTermFees.length === 0 && openingBalance <= 0 ? (
                        <tr><td colSpan={7} className="text-center py-8 text-slate-400">No current term ledger items.</td></tr>
                      ) : currentTermFees.map((fee: any, index: number) => {
                        const feePayments = paymentsData.filter((payment: any) => payment.feeId === fee.id);
                        const paid = feePayments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
                        const balance = Math.max(0, Number(fee.amount || 0) - paid);
                        const status = balance <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Pending';
                        return (
                          <tr key={fee.id}>
                            <td>{index + 1 + (openingBalance > 0 ? 1 : 0)}</td>
                            <td className="font-medium">{fee.description}</td>
                            <td><span className="badge badge-info">Current Term {fee.term}</span></td>
                            <td>{formatMoney(fee.amount || 0)}</td>
                            <td className="text-emerald-600 font-semibold">{formatMoney(paid)}</td>
                            <td className={balance > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{formatMoney(balance)}</td>
                            <td><span className={`badge ${status === 'Paid' ? 'badge-success' : status === 'Partial' ? 'badge-warning' : 'badge-danger'}`}>{status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Pay Modal — full page blur, centered ────────────────────────────── */}
      {showPayModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowPayModal(null)}>
          <div className="modal-card w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2"><CreditCard size={18} className="text-white" /><h3 className="font-bold text-white">Record Payment</h3></div>
              <button onClick={() => setShowPayModal(null)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <p className="text-xs text-slate-500">Fee</p>
                <p className="font-semibold text-slate-800 dark:text-white">{showPayModal.desc}</p>
                <p className="text-xs text-slate-500 mt-1">Balance due: <span className="font-bold text-red-600">{formatMoney(showPayModal.remaining)}</span></p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Amount *</label>
                  <input type="number" min="1" max={showPayModal.remaining} step="any"
                    value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    className="form-input" placeholder="0.00" autoFocus />
                </div>
                <div>
                  <label className="form-label">Payment Date *</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="form-input" />
                </div>
              </div>

              <div>
                <label className="form-label">Payment Method *</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="form-input">
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="text" value={payNote} onChange={e => setPayNote(e.target.value)}
                  className="form-input" placeholder="e.g. Receipt #1234, paid by father..." />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowPayModal(null)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleRecordPayment} disabled={paying} className="btn btn-primary">
                  {paying ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {previewImage && (
        <ImageModal src={previewImage.src} alt={previewImage.alt} isOpen={!!previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  );
}
