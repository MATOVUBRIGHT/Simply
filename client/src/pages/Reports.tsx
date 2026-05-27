import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Users, DollarSign, Calendar, UserCheck, BookOpen, ChevronDown, FileText, Printer, Layers, Receipt, Award, Percent, Search, TrendingUp, WalletCards } from 'lucide-react';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../contexts/ToastContext';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/export';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { sortClassesBySectionThenLevel } from '../utils/classroom';
import { openPrintPreview } from '../utils/printPreview';
import { matchesTextSearch } from '../utils/searchMatch';
import { computeProfitSummary } from '../utils/profit';

type ReportType = 'terms' | 'students' | 'fees' | 'payments' | 'attendance' | 'staff' | 'classes' | 'academic' | 'bursaries' | 'discounts' | 'invoices';
type ReportRow = Record<string, string | number>;

const reportTypes: Array<{ id: ReportType; label: string; icon: any; description: string }> = [
  { id: 'terms', label: 'Track Terms', icon: Layers, description: 'Term and year records across the school' },
  { id: 'students', label: 'Student Records', icon: Users, description: 'All active and completed student records' },
  { id: 'fees', label: 'Fees', icon: DollarSign, description: 'Invoices, balances, and fee items' },
  { id: 'payments', label: 'Payments', icon: Receipt, description: 'Payment records by student and term' },
  { id: 'attendance', label: 'Attendance', icon: Calendar, description: 'Attendance summary report' },
  { id: 'academic', label: 'Academic Documents', icon: FileText, description: 'Reports grouped by separate exam' },
  { id: 'bursaries', label: 'Bursaries', icon: Award, description: 'Full and partial bursary records' },
  { id: 'discounts', label: 'Discounts', icon: Percent, description: 'Discount records by student or class' },
  { id: 'classes', label: 'Class Summary', icon: BookOpen, description: 'Classes and enrollment report' },
  { id: 'staff', label: 'Staff Directory', icon: UserCheck, description: 'Export all staff members' },
  { id: 'invoices', label: 'Invoice Records', icon: FileText, description: 'Invoice documents and status' },
];

const columnLabels: Record<string, string> = {
  no: 'No.',
  term: 'Term',
  year: 'Year',
  className: 'Class',
  idNumber: 'Student ID',
  studentName: 'Student',
  status: 'Status',
  gender: 'Gender',
  guardian: 'Guardian',
  phone: 'Phone',
  email: 'Email',
  description: 'Description',
  amount: 'Amount',
  paid: 'Paid',
  balance: 'Balance',
  method: 'Method',
  date: 'Date',
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  staffName: 'Staff',
  role: 'Role',
  examName: 'Exam',
  results: 'Results',
  subjects: 'Subjects',
  students: 'Students',
  fees: 'Fees',
  payments: 'Payments',
  bursaries: 'Bursaries',
  discounts: 'Discounts',
  invoices: 'Invoices',
  createdAt: 'Created',
  dueDate: 'Due Date',
  type: 'Type',
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function dateInRange(value: unknown, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < new Date(from).getTime()) return false;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (time > end.getTime()) return false;
  }
  return true;
}

function termRank(term: string) {
  const n = Number(String(term).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getSettingsMap(rows: any[]) {
  return rows.reduce((acc: Record<string, any>, row: any) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

export default function Reports() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const [selectedReport, setSelectedReport] = useState<ReportType>('terms');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [profitTerm, setProfitTerm] = useState('all');
  const [profitYear, setProfitYear] = useState('all');
  const [selectedClass, setSelectedClass] = useState('all');
  const [search, setSearch] = useState('');
  const { formatMoney } = useCurrency();
  const { addToast } = useToast();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const { data: studentsData } = useTableData(sid, 'students');
  const { data: staffData } = useTableData(sid, 'staff');
  const { data: classesData } = useTableData(sid, 'classes');
  const { data: feesData } = useTableData(sid, 'fees');
  const { data: paymentsData } = useTableData(sid, 'payments');
  const { data: attendanceData } = useTableData(sid, 'attendance');
  const { data: examsData } = useTableData(sid, 'exams');
  const { data: examResultsData } = useTableData(sid, 'examResults');
  const { data: subjectsData } = useTableData(sid, 'subjects');
  const { data: bursariesData } = useTableData(sid, 'bursaries');
  const { data: discountsData } = useTableData(sid, 'discounts');
  const { data: invoicesData } = useTableData(sid, 'invoices');
  const { data: salaryPaymentsData } = useTableData(sid, 'salaryPayments');
  const { data: expensesData } = useTableData(sid, 'expenses');
  const { data: settingsData } = useTableData(sid, 'settings');

  const settings = useMemo(() => getSettingsMap(settingsData as any[]), [settingsData]);
  const students = studentsData as any[];
  const staff = staffData as any[];
  const classes = useMemo(() => sortClassesBySectionThenLevel(classesData as any[]), [classesData]);
  const fees = feesData as any[];
  const payments = paymentsData as any[];
  const attendance = attendanceData as any[];
  const exams = examsData as any[];
  const examResults = examResultsData as any[];
  const subjects = subjectsData as any[];
  const bursaries = bursariesData as any[];
  const discounts = discountsData as any[];
  const invoices = invoicesData as any[];
  const salaryPayments = salaryPaymentsData as any[];
  const expenses = expensesData as any[];
  const bankAccounts = useMemo(() => {
    try {
      const saved = settings.paymentAccountsJson ? JSON.parse(settings.paymentAccountsJson) : null;
      if (Array.isArray(saved)) {
        return saved
          .filter((account: any) => !account.hidden)
          .map((account: any) => {
            const method = String(account.paymentMethod || '').toLowerCase();
            return {
              accountName: account.accountName || '',
              accountNumber: method.includes('cash') ? '' : account.accountNumber || '',
              bankName: method.includes('mobile') ? '' : account.bankName || '',
              bankBranch: method.includes('mobile') || method.includes('cash') ? '' : account.bankBranch || '',
              paymentMethod: account.paymentMethod || '',
            };
          })
          .filter((account: any) => account.accountName || account.accountNumber || account.bankName || account.bankBranch || account.paymentMethod);
      }
    } catch {
      // Use legacy account settings below.
    }
    const accounts = [];
    for (const suffix of ['', '2', '3']) {
      if (settings[`paymentAccountHidden${suffix}`] === 'true') continue;
      const accountName = settings[`bankAccountName${suffix}`];
      const accountNumber = settings[`bankAccountNumber${suffix}`];
      const bankName = settings[`bankName${suffix}`];
      const bankBranch = settings[`bankBranch${suffix}`];
      const paymentMethod = settings[`paymentMethod${suffix}`];
      const method = String(paymentMethod || '').toLowerCase();
      if (accountName || accountNumber || bankName || bankBranch || paymentMethod) {
        accounts.push({
          accountName,
          accountNumber: method.includes('cash') ? '' : accountNumber,
          bankName: method.includes('mobile') ? '' : bankName,
          bankBranch: method.includes('mobile') || method.includes('cash') ? '' : bankBranch,
          paymentMethod,
        });
      }
    }
    return accounts;
  }, [settings]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) setShowExportMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const className = (classId?: string) => classes.find((c: any) => c.id === classId)?.name || classId || '-';
  const studentName = (student?: any) => student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'N/A';
  const getStudent = (studentId?: string) => students.find((s: any) => s.id === studentId);
  const getFee = (feeId?: string) => fees.find((f: any) => f.id === feeId);

  const termOptions = useMemo(() => {
    const values = [settings.currentTerm || '1'];
    [...fees, ...exams, ...bursaries, ...discounts, ...invoices].forEach((row: any) => row?.term && values.push(row.term));
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => termRank(a) - termRank(b) || a.localeCompare(b));
  }, [fees, exams, bursaries, discounts, invoices, settings.currentTerm]);

  const yearOptions = useMemo(() => {
    const values = [settings.academicYear || String(new Date().getFullYear())];
    [...fees, ...exams, ...bursaries, ...discounts, ...invoices].forEach((row: any) => row?.year && values.push(row.year));
    students.forEach((row: any) => row?.completedYear && values.push(row.completedYear));
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
  }, [fees, exams, bursaries, discounts, invoices, students, settings.academicYear]);

  function matchesTermYear(row: any) {
    if (selectedTerm !== 'all' && String(row.term || row.completedTerm || '') !== selectedTerm) return false;
    if (selectedYear !== 'all' && String(row.year || row.completedYear || '') !== selectedYear) return false;
    return true;
  }

  function matchesClass(row: any) {
    if (selectedClass === 'all') return true;
    const student = getStudent(row.studentId || row.entityId);
    return row.classId === selectedClass || student?.classId === selectedClass;
  }

  const profitSummary = useMemo(() => {
    return computeProfitSummary({
      fees,
      payments,
      salaryPayments,
      expenses,
      students,
      term: profitTerm,
      year: profitYear,
      classId: selectedClass,
      dateFrom,
      dateTo,
    });
  }, [fees, payments, salaryPayments, expenses, students, profitTerm, profitYear, selectedClass, dateFrom, dateTo]);

  function makeRows(): ReportRow[] {
    const searchMatch = (row: ReportRow) => matchesTextSearch(Object.values(row), search);
    let rows: ReportRow[] = [];

    if (selectedReport === 'students') {
      rows = students
        .filter((s: any) => selectedClass === 'all' || s.classId === selectedClass)
        .filter((s: any) => selectedYear === 'all' || String(s.completedYear || settings.academicYear || '') === selectedYear || s.status !== 'completed')
        .map((s: any) => ({
          idNumber: s.studentId || s.admissionNo || s.id,
          studentName: studentName(s),
          className: className(s.classId),
          gender: s.gender || '-',
          status: s.status || 'active',
          term: s.status === 'completed' ? s.completedTerm || 'Final' : settings.currentTerm || '-',
          year: s.status === 'completed' ? s.completedYear || '-' : settings.academicYear || '-',
          guardian: s.guardianName || '-',
          phone: s.guardianPhone || '-',
        }));
    } else if (selectedReport === 'fees') {
      rows = fees.filter(matchesTermYear).filter(matchesClass).map((fee: any) => {
        const student = getStudent(fee.studentId);
        const paid = payments.filter((p: any) => p.feeId === fee.id).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
        return {
          term: fee.term || '-',
          year: fee.year || '-',
          idNumber: student?.studentId || student?.admissionNo || fee.studentId || '-',
          studentName: studentName(student),
          className: className(fee.classId || student?.classId),
          description: fee.description || 'Fee',
          amount: formatMoney(Number(fee.amount || 0)),
          paid: formatMoney(paid),
          balance: formatMoney(Math.max(0, Number(fee.amount || 0) - paid)),
          dueDate: fee.dueDate || '-',
        };
      });
    } else if (selectedReport === 'payments') {
      rows = payments
        .filter((payment: any) => dateInRange(payment.date || payment.createdAt, dateFrom, dateTo))
        .filter((payment: any) => {
          const fee = getFee(payment.feeId);
          return matchesTermYear(fee || {}) && matchesClass({ ...payment, classId: fee?.classId });
        })
        .map((payment: any) => {
          const fee = getFee(payment.feeId);
          const student = getStudent(payment.studentId);
          return {
            date: payment.date || payment.createdAt || '-',
            term: fee?.term || '-',
            year: fee?.year || '-',
            idNumber: student?.studentId || student?.admissionNo || payment.studentId || '-',
            studentName: studentName(student),
            className: className(fee?.classId || student?.classId),
            description: fee?.description || payment.paymentType || 'Payment',
            amount: formatMoney(Number(payment.amount || 0)),
            method: payment.method || '-',
          };
        });
    } else if (selectedReport === 'attendance') {
      rows = attendance
        .filter((record: any) => dateInRange(record.date || record.createdAt, dateFrom, dateTo))
        .filter(matchesClass)
        .map((record: any) => {
          const student = getStudent(record.entityId);
          return {
            date: record.date || '-',
            idNumber: student?.studentId || student?.admissionNo || record.entityId || '-',
            studentName: studentName(student),
            className: className(student?.classId),
            status: record.status || '-',
          };
        });
    } else if (selectedReport === 'academic') {
      rows = exams.filter(matchesTermYear).filter(matchesClass).map((exam: any) => {
        const examRows = examResults.filter((r: any) => r.examId === exam.id);
        return {
          term: exam.term || '-',
          year: exam.year || '-',
          examName: exam.name || 'Exam',
          className: className(exam.classId),
          results: examRows.length,
          subjects: new Set(examRows.map((r: any) => r.subjectId)).size || subjects.filter((s: any) => s.classId === exam.classId).length,
          date: exam.startDate || exam.createdAt || '-',
        };
      });
    } else if (selectedReport === 'bursaries') {
      rows = bursaries.filter(matchesTermYear).filter(matchesClass).map((b: any) => {
        const student = getStudent(b.studentId);
        return {
          term: b.term || '-',
          year: b.year || '-',
          idNumber: student?.studentId || student?.admissionNo || b.studentId || '-',
          studentName: b.studentName || studentName(student),
          className: className(student?.classId),
          type: b.isFull ? 'Full bursary' : 'Bursary',
          amount: b.isFull ? 'Full' : formatMoney(Number(b.amount || 0)),
          description: b.reason || '-',
        };
      });
    } else if (selectedReport === 'discounts') {
      rows = discounts.filter(matchesTermYear).filter(matchesClass).map((d: any) => {
        const student = getStudent(d.studentId);
        return {
          term: d.term || '-',
          year: d.year || '-',
          idNumber: student?.studentId || student?.admissionNo || d.studentId || '-',
          studentName: d.studentName || studentName(student),
          className: className(d.classId || student?.classId),
          type: d.type || 'amount',
          amount: d.type === 'percentage' ? `${Number(d.amount || 0)}%` : formatMoney(Number(d.amount || 0)),
          description: d.reason || '-',
        };
      });
    } else if (selectedReport === 'classes') {
      rows = classes.filter((c: any) => selectedClass === 'all' || c.id === selectedClass).map((c: any) => {
        const classStudents = students.filter((s: any) => s.classId === c.id && s.status !== 'completed');
        const classFees = fees.filter((f: any) => (selectedTerm === 'all' || String(f.term) === selectedTerm) && (selectedYear === 'all' || String(f.year) === selectedYear) && (f.classId === c.id || getStudent(f.studentId)?.classId === c.id));
        const classPayments = payments.filter((p: any) => classFees.some((f: any) => f.id === p.feeId));
        return {
          className: c.name,
          students: classStudents.length,
          fees: formatMoney(classFees.reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0)),
          payments: formatMoney(classPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)),
          subjects: subjects.filter((s: any) => s.classId === c.id).length,
          exams: exams.filter((e: any) => e.classId === c.id && matchesTermYear(e)).length,
        };
      });
    } else if (selectedReport === 'staff') {
      rows = staff.map((s: any) => ({
        idNumber: s.employeeId || s.id,
        staffName: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        role: s.role || '-',
        phone: s.phone || '-',
        email: s.email || '-',
        status: s.status || 'active',
      }));
    } else if (selectedReport === 'invoices') {
      rows = invoices.filter(matchesTermYear).filter(matchesClass).map((invoice: any) => {
        const student = getStudent(invoice.studentId);
        return {
          term: invoice.term || '-',
          year: invoice.year || '-',
          idNumber: student?.studentId || student?.admissionNo || invoice.studentId || '-',
          studentName: studentName(student),
          className: className(invoice.classId || student?.classId),
          amount: formatMoney(Number(invoice.totalAmount || invoice.amount || 0)),
          status: invoice.status || '-',
          date: invoice.issuedAt || invoice.createdAt || '-',
        };
      });
    } else {
      const keys = new Set<string>();
      [...fees, ...exams, ...bursaries, ...discounts, ...invoices].forEach((row: any) => {
        if (row?.term && row?.year) keys.add(`${row.year}|${row.term}|${row.classId || 'all'}`);
      });
      keys.add(`${settings.academicYear || new Date().getFullYear()}|${settings.currentTerm || '1'}|all`);
      rows = Array.from(keys).map(key => {
        const [year, term, classId] = key.split('|');
        const termFees = fees.filter((f: any) => String(f.term) === term && String(f.year) === year && (classId === 'all' || f.classId === classId));
        const feeIds = new Set(termFees.map((f: any) => f.id));
        const termPayments = payments.filter((p: any) => feeIds.has(p.feeId));
        const termExams = exams.filter((e: any) => String(e.term) === term && String(e.year) === year && (classId === 'all' || e.classId === classId));
        const examIds = new Set(termExams.map((e: any) => e.id));
        return {
          term,
          year,
          className: classId === 'all' ? 'All classes' : className(classId),
          students: classId === 'all' ? students.filter((s: any) => s.status !== 'completed').length : students.filter((s: any) => s.classId === classId && s.status !== 'completed').length,
          fees: formatMoney(termFees.reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0)),
          payments: formatMoney(termPayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)),
          bursaries: bursaries.filter((b: any) => String(b.term) === term && String(b.year) === year).length,
          discounts: discounts.filter((d: any) => String(d.term) === term && String(d.year) === year).length,
          invoices: invoices.filter((i: any) => String(i.term) === term && String(i.year) === year).length,
          exams: termExams.length,
          results: examResults.filter((r: any) => examIds.has(r.examId)).length,
        };
      }).filter(matchesTermYear).filter((row: any) => selectedClass === 'all' || row.className === className(selectedClass));
    }

    return rows.filter(searchMatch).map((row, index) => ({ no: index + 1, ...row }));
  }

  const rows = useMemo(makeRows, [selectedReport, selectedTerm, selectedYear, selectedClass, search, dateFrom, dateTo, students, staff, classes, fees, payments, attendance, exams, examResults, subjects, bursaries, discounts, invoices, settings]);
  const columns = useMemo(() => {
    const keys = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach(key => set.add(key));
      return set;
    }, new Set<string>()));
    return keys.map(key => ({ key, label: columnLabels[key] || key }));
  }, [rows]);
  const groupedRows = useMemo(() => {
    const groups = new Map<string, ReportRow[]>();
    rows.forEach(row => {
      const key = normalize(row.className) || (selectedReport === 'staff' ? 'Staff' : 'Unassigned');
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    });
    const classOrder = new Map(classes.map((cls: any, index: number) => [cls.name, index]));
    return Array.from(groups.entries())
      .sort(([a], [b]) => (classOrder.get(a) ?? 9999) - (classOrder.get(b) ?? 9999) || a.localeCompare(b))
      .map(([className, groupRows]) => ({ className, rows: groupRows }));
  }, [rows, classes, selectedReport]);
  const reportLabel = reportTypes.find(r => r.id === selectedReport)?.label || 'Report';

  function exportRows(kind: 'pdf' | 'csv' | 'excel') {
    if (rows.length === 0) {
      addToast('No report rows to export', 'warning');
      return;
    }
    const filename = `${selectedReport}-report-${selectedTerm === 'all' ? 'all-terms' : `term-${selectedTerm}`}-${selectedYear === 'all' ? 'all-years' : selectedYear}`;
    if (kind === 'pdf') exportToPDF(reportLabel, rows, columns, filename);
    if (kind === 'csv') exportToCSV(rows, filename, columns as any);
    if (kind === 'excel') exportToExcel(rows, filename, columns as any);
    addToast(`Report exported to ${kind.toUpperCase()}`, 'success');
    setShowExportMenu(false);
  }

  function printReport() {
    setShowExportMenu(false);
    window.setTimeout(() => openPrintPreview(reportLabel, '#reports-selected-print'), 50);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track terms, years, classes, fees, academic records, and school history</p>
        </div>
        <div className="relative" ref={exportMenuRef}>
          <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-primary">
            <Download size={18} /> Export / Print <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
          </button>
          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[99999] overflow-hidden animate-dropdown-in">
              <button onClick={() => exportRows('pdf')} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} /> Export PDF</button>
              <button onClick={() => exportRows('csv')} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Download size={14} /> Export CSV</button>
              <button onClick={() => exportRows('excel')} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><FileText size={14} /> Export Excel</button>
              <button onClick={printReport} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"><Printer size={14} /> Print</button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {reportTypes.map((report, index) => {
          const cardColors = ['card-solid-indigo', 'card-solid-emerald', 'card-solid-violet', 'card-solid-rose', 'card-solid-cyan', 'card-solid-amber'];
          return (
            <button key={report.id} onClick={() => setSelectedReport(report.id)} className={`${cardColors[index % cardColors.length]} p-5 text-left transition-all ${selectedReport === report.id ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-transparent' : ''}`}>
              <report.icon size={26} className="mb-3 text-white" />
              <h3 className="font-semibold text-white">{report.label}</h3>
              <p className="text-xs text-white/80 mt-1 whitespace-normal">{report.description}</p>
            </button>
          );
        })}
      </div>

      <section className="card overflow-hidden">
        <div className="card-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-500" />
            <h2 className="font-bold text-slate-800 dark:text-white">Profit Summary</h2>
            <span className="text-xs text-slate-400">Uses class/date filters plus profit term/year</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-72">
            <select value={profitTerm} onChange={e => setProfitTerm(e.target.value)} className="form-input form-select truncate px-3 pr-7">
              <option value="all">All terms</option>
              {termOptions.map(term => <option key={term} value={term}>Term {term}</option>)}
            </select>
            <select value={profitYear} onChange={e => setProfitYear(e.target.value)} className="form-input form-select truncate px-3 pr-7">
              <option value="all">All years</option>
              {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>
        <div className="card-body grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-xs font-bold uppercase text-slate-400">Expected Income</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{formatMoney(profitSummary.billed)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <p className="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300">Profit Collected</p>
            <p className="mt-1 text-lg font-black text-emerald-700 dark:text-emerald-200">{formatMoney(profitSummary.collected)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <p className="text-xs font-bold uppercase text-red-600 dark:text-red-300">Expenses</p>
            <p className="mt-1 text-lg font-black text-red-700 dark:text-red-200">{formatMoney(profitSummary.totalExpenses)}</p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
            <p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-300">Net Profit Available</p>
            <p className={`mt-1 text-lg font-black ${profitSummary.netProfit >= 0 ? 'text-indigo-700 dark:text-indigo-200' : 'text-red-600 dark:text-red-300'}`}>{formatMoney(profitSummary.netProfit)}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="flex items-center gap-1 text-xs font-bold uppercase text-amber-700 dark:text-amber-300"><WalletCards size={13} /> Not Paid</p>
            <p className="mt-1 text-lg font-black text-amber-800 dark:text-amber-200">{formatMoney(profitSummary.unpaid)}</p>
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Needed to cover expenses: {formatMoney(profitSummary.amountNeededForProfit)}</p>
          </div>
        </div>
      </section>

      <div id="reports-selected-print" className="card print-area">
        <div className="card-header flex flex-wrap items-center justify-between gap-3">
          <span>{reportLabel}</span>
          <span className="badge badge-info">{rows.length} rows</span>
        </div>
        <div className="card-body space-y-4">
          <div className="hidden border-b border-slate-300 pb-4 text-slate-900 print:flex print:items-start print:justify-between print:gap-4">
            <div className="flex items-start gap-3">
              {settings.schoolLogo && <img src={settings.schoolLogo} alt="School logo" className="h-16 w-16 object-contain" />}
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight">{settings.schoolName || 'School'}</h2>
                {settings.schoolAddress && <p className="text-sm text-slate-600">{settings.schoolAddress}</p>}
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  {settings.schoolPhone && <span>Tel: {settings.schoolPhone}</span>}
                  {settings.schoolEmail && <span>Email: {settings.schoolEmail}</span>}
                </div>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="font-bold uppercase tracking-wide">{reportLabel}</p>
              <p className="text-slate-500">Printed {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 print:hidden md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(112px,130px)_minmax(112px,130px)_minmax(130px,160px)_minmax(210px,240px)]">
            <div className="input-icon-wrapper">
              <Search size={16} className="input-icon" />
              <input value={search} onChange={e => setSearch(e.target.value)} className="form-input form-input-with-icon" placeholder="Search report..." />
            </div>
            <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="form-input form-select truncate px-3 pr-7">
              <option value="all">All terms</option>
              {termOptions.map(term => <option key={term} value={term}>Term {term}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="form-input form-select truncate px-3 pr-7">
              <option value="all">All years</option>
              {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
            </select>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="form-input form-select truncate px-3 pr-7">
              <option value="all">All classes</option>
              {classes.map((cls: any) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="form-input" title="From date" />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="form-input" title="To date" />
            </div>
          </div>
          {(selectedReport === 'invoices' || selectedReport === 'payments' || selectedReport === 'fees') && bankAccounts.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Payment Details</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {bankAccounts.map((account, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <p className="font-bold text-slate-800 dark:text-white">{account.bankName || account.paymentMethod || `Account ${index + 1}`}</p>
                    {account.bankBranch && <p className="mt-1 text-slate-500">Branch: {account.bankBranch}</p>}
                    {account.accountName && <p className="mt-1 text-slate-500">{account.accountName}</p>}
                    {account.accountNumber && <p className="mt-1 font-mono font-bold text-indigo-600 dark:text-indigo-300">{account.accountNumber}</p>}
                    {account.paymentMethod && <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{account.paymentMethod}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="table-container print:shadow-none print:border-0">
            <table>
              <thead>
                <tr>{columns.map(column => <th key={column.key}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={Math.max(columns.length, 1)} className="text-center py-12 text-slate-400">No records match this report.</td></tr>
                ) : groupedRows.map(group => (
                  <Fragment key={group.className}>
                    <tr className="bg-slate-50 dark:bg-slate-800/80">
                      <td colSpan={Math.max(columns.length, 1)} className="px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-300">
                        {group.className} <span className="ml-2 font-semibold normal-case text-slate-400">{group.rows.length} record{group.rows.length === 1 ? '' : 's'}</span>
                      </td>
                    </tr>
                    {group.rows.slice(0, Math.max(0, 300)).map((row, index) => (
                      <tr key={`${group.className}-${index}`}>{columns.map(column => <td key={column.key}>{row[column.key] ?? '-'}</td>)}</tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 300 && <p className="text-xs text-slate-400">Showing first 300 rows. Export to get the full report.</p>}
        </div>
      </div>
    </div>
  );
}
