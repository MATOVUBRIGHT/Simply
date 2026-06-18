import { useMemo, useState, useEffect } from 'react';
import { CheckCircle, Download, Eye, FileText, Printer, RefreshCw, Search, XCircle, Plus, Settings } from 'lucide-react';
import type { Class, Student } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCurrency } from '../hooks/useCurrency';
import { useTableData } from '../lib/store';
import { getClassDisplayName, sortClassesBySectionThenLevel } from '../utils/classroom';
import { exportToCSV } from '../utils/export';
import { sortStudentsForList } from '../utils/studentOrdering';
import { PortalSelect } from '../components/PortalSelect';

type GeneratedCard = {
  studentId: string;
  docketNo: string;
  generatedAt: string;
};

type PassCustomization = {
  backgroundColor: string;
  textColor: string;
  headerBackgroundColor: string;
  headerTextColor: string;
  footerText: string;
  additionalNotes: string;
};

function studentName(student: Student) {
  return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed learner';
}

function studentNumber(student: Student) {
  return student.studentId || student.admissionNo || student.id;
}

function normalizeTerm(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^[123]$/.test(text)) return `Term ${text}`;
  if (/^term\s*[123]$/i.test(text)) return text.replace(/\s+/, ' ').replace(/^term/i, 'Term');
  return text;
}

export default function ExamClearance() {
  const { user, schoolId } = useAuth();
  const tenantId = schoolId || user?.id || '';
  const { data: studentsData } = useTableData(tenantId, 'students');
  const { data: classesData } = useTableData(tenantId, 'classes');
  const { data: feesData } = useTableData(tenantId, 'fees');
  const { data: paymentsData } = useTableData(tenantId, 'payments');
  const { data: settings } = useTableData(tenantId, 'settings');
  const { formatMoney } = useCurrency();
  const { addToast } = useToast();

  const classes = useMemo(() => sortClassesBySectionThenLevel(classesData as Class[]), [classesData]);
  const students = studentsData as Student[];
  const fees = feesData as any[];
  const payments = paymentsData as any[];
  const currentYear = useMemo(() => String(
    settings.find((row: any) => row.key === 'currentAcademicYear')?.value
    || settings.find((row: any) => row.key === 'academicYear')?.value
    || new Date().getFullYear()
  ), [settings]);
  const currentTerm = useMemo(() => normalizeTerm(
    settings.find((row: any) => row.key === 'currentTerm')?.value || 'Term 1'
  ), [settings]);

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState(currentTerm || 'Term 1');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [examName, setExamName] = useState('End of Term Exams');
  const [docketPrefix, setDocketPrefix] = useState('EX');
  const [startNumber, setStartNumber] = useState('1');
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [passCustomization, setPassCustomization] = useState<PassCustomization>({
    backgroundColor: '#ffffff',
    textColor: '#0f172a',
    headerBackgroundColor: '#0f172a',
    headerTextColor: '#ffffff',
    footerText: 'School Official Stamp Required',
    additionalNotes: '',
  });

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 8 }, (_item, index) => String(now + 1 - index));
  }, []);

  const paymentByFee = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((payment: any) => {
      if (!payment.feeId) return;
      map.set(payment.feeId, (map.get(payment.feeId) || 0) + Number(payment.amount || 0));
    });
    return map;
  }, [payments]);

  const directPaymentByStudent = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((payment: any) => {
      if (payment.feeId || !payment.studentId) return;
      map.set(payment.studentId, (map.get(payment.studentId) || 0) + Number(payment.amount || 0));
    });
    return map;
  }, [payments]);

  const classStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortStudentsForList(students.filter(student => {
      const inClass = selectedClass ? student.classId === selectedClass : Boolean(needle);
      const active = student.status !== 'inactive' && student.status !== 'completed' && student.status !== 'graduated';
      const matchesQuery = !needle || [
        studentName(student),
        studentNumber(student),
        getClassDisplayName(student.classId, classes),
      ].some(value => String(value || '').toLowerCase().includes(needle));
      return inClass && active && matchesQuery;
    }));
  }, [classes, query, selectedClass, students]);

  const clearanceRows = useMemo(() => {
    return classStudents.map(student => {
      const studentFees = fees.filter((fee: any) => {
        const feeClassMatches = selectedClass
          ? (fee.classId ? fee.classId === selectedClass : true)
          : (!fee.classId || fee.classId === student.classId);
        return fee.studentId === student.id
          && feeClassMatches
          && String(fee.year || '') === String(selectedYear)
          && normalizeTerm(fee.term) === normalizeTerm(selectedTerm);
      });
      const invoiced = studentFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
      const paidAgainstFees = studentFees.reduce((sum: number, fee: any) => sum + (paymentByFee.get(fee.id) || 0), 0);
      const directPaid = directPaymentByStudent.get(student.id) || 0;
      const paid = paidAgainstFees + directPaid;
      const balance = Math.max(0, invoiced - paid);
      return {
        student,
        invoiced,
        paid,
        balance,
        cleared: invoiced > 0 && balance <= 0,
        noInvoice: invoiced <= 0,
      };
    });
  }, [classStudents, directPaymentByStudent, fees, paymentByFee, selectedClass, selectedTerm, selectedYear]);

  // When searching and we have exactly one cleared student, auto-select class and generate pass!
  useEffect(() => {
    if (classStudents.length === 1 && query.trim()) {
      setSelectedClass(classStudents[0].classId);
      const row = clearanceRows.find(item => item.student.id === classStudents[0].id && item.cleared);
      if (row) {
        const start = Math.max(1, Number(startNumber || 1));
        const prefix = docketPrefix.trim().toUpperCase() || 'EX';
        const nextCard = {
          studentId: row.student.id,
          docketNo: `${prefix}-${selectedYear}-${String(start).padStart(3, '0')}`,
          generatedAt: new Date().toISOString(),
        };
        setCards([nextCard]);
        setCardsVisible(true);
      }
    }
  }, [classStudents, query, clearanceRows, selectedYear, startNumber, docketPrefix]);

  const clearedRows = clearanceRows.filter(row => row.cleared);
  const blockedRows = clearanceRows.filter(row => !row.cleared);
  const cardRows = cards
    .map(card => {
      const row = clearedRows.find(item => item.student.id === card.studentId);
      return row ? { ...row, docketNo: card.docketNo, generatedAt: card.generatedAt } : null;
    })
    .filter(Boolean) as Array<(typeof clearedRows)[number] & GeneratedCard>;

  function generateCards() {
    if (!selectedClass) {
      addToast('Select a class first', 'error');
      return;
    }
    if (clearedRows.length === 0) {
      addToast('No cleared students found for this class and term', 'warning');
      return;
    }
    const start = Math.max(1, Number(startNumber || 1));
    const prefix = docketPrefix.trim().toUpperCase() || 'EX';
    const nextCards = clearedRows.map((row, index) => ({
      studentId: row.student.id,
      docketNo: `${prefix}-${selectedYear}-${String(start + index).padStart(3, '0')}`,
      generatedAt: new Date().toISOString(),
    }));
    setCards(nextCards);
    setCardsVisible(true);
    addToast(`${nextCards.length} exam pass card${nextCards.length === 1 ? '' : 's'} generated`, 'success');
  }

  function generateSingleCard(studentId: string) {
    const row = clearedRows.find(item => item.student.id === studentId);
    if (!row) {
      addToast('Student not found or not cleared', 'error');
      return;
    }
    const start = Math.max(1, Number(startNumber || 1));
    const prefix = docketPrefix.trim().toUpperCase() || 'EX';
    const nextCard = {
      studentId: row.student.id,
      docketNo: `${prefix}-${selectedYear}-${String(start).padStart(3, '0')}`,
      generatedAt: new Date().toISOString(),
    };
    setCards([nextCard]);
    setCardsVisible(true);
    addToast('Exam pass card generated for selected student', 'success');
  }

  function exportClearance() {
    exportToCSV(
      clearanceRows.map(row => ({
        Name: studentName(row.student),
        ID: studentNumber(row.student),
        Class: getClassDisplayName(row.student.classId, classes),
        Term: selectedTerm,
        Year: selectedYear,
        Invoiced: row.invoiced,
        Paid: row.paid,
        Balance: row.balance,
        Status: row.cleared ? 'Cleared' : row.noInvoice ? 'No invoice' : 'Not cleared',
      })),
      'exam-clearance',
      [
        { key: 'Name', label: 'Name' },
        { key: 'ID', label: 'ID' },
        { key: 'Class', label: 'Class' },
        { key: 'Term', label: 'Term' },
        { key: 'Year', label: 'Year' },
        { key: 'Invoiced', label: 'Invoiced' },
        { key: 'Paid', label: 'Paid' },
        { key: 'Balance', label: 'Balance' },
        { key: 'Status', label: 'Status' },
      ]
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header print:hidden">
        <div className="page-title">
          <h1 className="text-title">Exam Clearance & Cards</h1>
          <p className="text-subtitle">View cleared students, assign dockets, and generate exam pass cards on request</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={exportClearance} className="btn btn-secondary">
            <Download size={16} /> Export Clearance
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn-secondary" disabled={cardRows.length === 0}>
            <Printer size={16} /> Print Cards
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <p className="text-sm font-semibold text-white/80">Cleared to Sit</p>
          <p className="mt-3 text-3xl font-black">{clearedRows.length}</p>
        </div>
        <div className="card-solid-rose p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <p className="text-sm font-semibold text-white/80">Not Cleared</p>
          <p className="mt-3 text-3xl font-black">{blockedRows.length}</p>
        </div>
        <div className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <p className="text-sm font-semibold text-white/80">Generated Cards</p>
          <p className="mt-3 text-3xl font-black">{cardRows.length}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px] print:block">
        <div className="card overflow-hidden print:hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-500" />
              <h2 className="font-bold text-slate-900 dark:text-white">Class Clearance</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{clearanceRows.length} students</span>
          </div>
          <div className="border-b border-slate-100 p-4 dark:border-slate-700">
            <div className="grid gap-3 lg:grid-cols-[1fr_160px_150px_1fr]">
              <PortalSelect
                value={selectedClass}
                onChange={value => { setSelectedClass(value); setCards([]); setCardsVisible(false); }}
                options={[{ value: '', label: 'Select class to view clearance' }, ...classes.map(classItem => ({ value: classItem.id, label: getClassDisplayName(classItem.id, classes) }))]}
                className={`filter-select ${selectedClass ? 'filter-input-active' : ''}`}
              />
              <PortalSelect
                value={selectedTerm}
                onChange={value => { setSelectedTerm(value); setCards([]); setCardsVisible(false); }}
                options={['Term 1', 'Term 2', 'Term 3'].map(term => ({ value: term, label: term }))}
                className="filter-select filter-input-active"
              />
              <PortalSelect
                value={selectedYear}
                onChange={value => { setSelectedYear(value); setCards([]); setCardsVisible(false); }}
                options={years.map(year => ({ value: year, label: year }))}
                className="filter-select filter-input-active"
              />
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="search-input pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search learner or ID..." />
              </div>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Student</th><th>Invoiced</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {!selectedClass && !query.trim() ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm font-semibold text-slate-400">Select a class or search by learner name / ID</td></tr>
                ) : clearanceRows.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm font-semibold text-slate-400">No students found</td></tr>
                ) : clearanceRows.map(row => (
                  <tr key={row.student.id} className="bg-white transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          {studentName(row.student).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{studentName(row.student)}</p>
                          <p className="text-xs text-slate-400">{studentNumber(row.student)}</p>
                        </div>
                      </div>
                    </td>
                    <td>{formatMoney(row.invoiced)}</td>
                    <td>{formatMoney(row.paid)}</td>
                    <td className={row.balance > 0 ? 'font-bold text-rose-600' : 'font-bold text-emerald-600'}>{formatMoney(row.balance)}</td>
                    <td>
                      {row.cleared ? (
                        <span className="badge badge-success"><CheckCircle size={12} /> Cleared</span>
                      ) : row.noInvoice ? (
                        <span className="badge badge-warning"><FileText size={12} /> No invoice</span>
                      ) : (
                        <span className="badge badge-danger"><XCircle size={12} /> Not cleared</span>
                      )}
                    </td>
                    <td>
                      {row.cleared && (
                        <button
                          type="button"
                          onClick={() => generateSingleCard(row.student.id)}
                          className="btn btn-primary px-3 py-1.5 text-xs"
                        >
                          <Plus size={12} /> Generate Pass
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5 print:hidden">
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <FileText size={19} />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Pass Card Template</h2>
                <p className="text-xs font-semibold text-slate-400">Cards are created only when generated</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Exam Name</label>
                <input className="form-input" value={examName} onChange={event => setExamName(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Docket Prefix</label>
                  <input className="form-input" value={docketPrefix} onChange={event => setDocketPrefix(event.target.value)} />
                </div>
                <div>
                  <label className="form-label">Start No.</label>
                  <input type="number" min="1" className="form-input" value={startNumber} onChange={event => setStartNumber(event.target.value)} />
                </div>
              </div>
              <button type="button" onClick={generateCards} className="btn btn-primary w-full justify-center">
                <RefreshCw size={16} /> Generate Cards for Cleared Students
              </button>
              {cardRows.length > 0 && (
                <button type="button" onClick={() => setCardsVisible(value => !value)} className="btn btn-secondary w-full justify-center">
                  <Eye size={16} /> {cardsVisible ? 'Hide Cards' : 'View Cards'}
                </button>
              )}
              <button type="button" onClick={() => setShowCustomization(value => !value)} className="btn btn-secondary w-full justify-center">
                <Settings size={16} /> Customize Pass
              </button>
            </div>
          </div>

          {showCustomization && (
            <div className="card p-5">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                  <Settings size={19} />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white">Pass Customization</h2>
                  <p className="text-xs font-semibold text-slate-400">Customize colors, text, and notes</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Background Color</label>
                    <input
                      type="color"
                      className="w-full h-10 cursor-pointer rounded border border-slate-300"
                      value={passCustomization.backgroundColor}
                      onChange={event => setPassCustomization({ ...passCustomization, backgroundColor: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Text Color</label>
                    <input
                      type="color"
                      className="w-full h-10 cursor-pointer rounded border border-slate-300"
                      value={passCustomization.textColor}
                      onChange={event => setPassCustomization({ ...passCustomization, textColor: event.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Header Background</label>
                    <input
                      type="color"
                      className="w-full h-10 cursor-pointer rounded border border-slate-300"
                      value={passCustomization.headerBackgroundColor}
                      onChange={event => setPassCustomization({ ...passCustomization, headerBackgroundColor: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Header Text</label>
                    <input
                      type="color"
                      className="w-full h-10 cursor-pointer rounded border border-slate-300"
                      value={passCustomization.headerTextColor}
                      onChange={event => setPassCustomization({ ...passCustomization, headerTextColor: event.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">Footer Text</label>
                  <input
                    className="form-input"
                    value={passCustomization.footerText}
                    onChange={event => setPassCustomization({ ...passCustomization, footerText: event.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Additional Notes</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={passCustomization.additionalNotes}
                    onChange={event => setPassCustomization({ ...passCustomization, additionalNotes: event.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {cardsVisible && cardRows.length > 0 && (
          <div className="xl:col-span-2">
            <div className="mb-3 flex items-center justify-between print:hidden">
              <h2 className="font-bold text-slate-900 dark:text-white">Generated Pass Cards</h2>
              <span className="text-xs font-semibold text-slate-400">{cardRows.length} cards ready</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 print:grid print:grid-cols-2">
              {cardRows.map(row => (
                <div
                  key={row.student.id}
                  className="animate-slide-down overflow-hidden rounded-lg border-2 shadow-sm print:break-inside-avoid"
                  style={{
                    borderColor: passCustomization.headerBackgroundColor,
                    backgroundColor: passCustomization.backgroundColor,
                    color: passCustomization.textColor
                  }}
                >
                  <div
                    className="border-b-2 px-4 py-3"
                    style={{
                      borderColor: passCustomization.headerBackgroundColor,
                      backgroundColor: passCustomization.headerBackgroundColor,
                      color: passCustomization.headerTextColor
                    }}
                  >
                    <p className="text-xs font-black uppercase tracking-wide">Exam Pass Card</p>
                    <h3 className="mt-1 text-lg font-black">{examName || 'School Examination'}</h3>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase" style={{ color: passCustomization.textColor, opacity: 0.7 }}>Learner</p>
                        <p className="truncate text-xl font-black">{studentName(row.student)}</p>
                        <p className="text-sm font-semibold" style={{ color: passCustomization.textColor, opacity: 0.8 }}>{studentNumber(row.student)}</p>
                      </div>
                      <div
                        className="rounded-lg px-3 py-2 text-center"
                        style={{
                          border: `2px solid ${passCustomization.headerBackgroundColor}`
                        }}
                      >
                        <p className="text-[10px] font-black uppercase">Docket</p>
                        <p className="font-black">{row.docketNo}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div
                        className="rounded p-2"
                        style={{
                          border: `1px solid ${passCustomization.textColor}`,
                          opacity: 0.5
                        }}
                      >
                        <p className="text-[10px] font-black uppercase" style={{ color: passCustomization.textColor, opacity: 0.7 }}>Class</p>
                        <p className="font-bold">{getClassDisplayName(row.student.classId, classes)}</p>
                      </div>
                      <div
                        className="rounded p-2"
                        style={{
                          border: `1px solid ${passCustomization.textColor}`,
                          opacity: 0.5
                        }}
                      >
                        <p className="text-[10px] font-black uppercase" style={{ color: passCustomization.textColor, opacity: 0.7 }}>Term</p>
                        <p className="font-bold">{selectedTerm}</p>
                      </div>
                      <div
                        className="rounded p-2"
                        style={{
                          border: `1px solid ${passCustomization.textColor}`,
                          opacity: 0.5
                        }}
                      >
                        <p className="text-[10px] font-black uppercase" style={{ color: passCustomization.textColor, opacity: 0.7 }}>Year</p>
                        <p className="font-bold">{selectedYear}</p>
                      </div>
                    </div>
                    <div
                      className="rounded-lg p-3 text-sm font-bold"
                      style={{
                        backgroundColor: '#10b98133',
                        color: '#065f46'
                      }}
                    >
                      Cleared to sit for exams. Balance: {formatMoney(row.balance)}
                    </div>
                    {passCustomization.additionalNotes && (
                      <div className="rounded border-l-4 border-slate-400 pl-3 text-sm">
                        {passCustomization.additionalNotes}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 pt-5 text-xs font-semibold" style={{ color: passCustomization.textColor, opacity: 0.7 }}>
                      <div
                        className="border-t pt-2" style={{ borderColor: passCustomization.textColor, opacity: 0.5 } }>
                        {passCustomization.footerText || 'Class Teacher'}
                      </div>
                      <div
                        className="border-t pt-2" style={{ borderColor: passCustomization.textColor, opacity: 0.5 } }>
                        Exam Officer
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
