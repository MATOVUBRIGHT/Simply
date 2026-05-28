type ProfitArgs = {
  fees: any[];
  payments: any[];
  salaryPayments: any[];
  expenses: any[];
  students?: any[];
  classes?: any[];
  term?: string;
  year?: string;
  classId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ProfitSummary = {
  billed: number;
  collected: number;
  totalExpenses: number;
  netProfit: number;
  unpaid: number;
  amountNeededForProfit: number;
};

function dateInRange(value: unknown, from?: string, to?: string) {
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

function termFromDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return String(Math.floor(date.getMonth() / 4) + 1);
}

function termFromSalaryMonth(value: unknown) {
  const month = Number(value || 0);
  if (!Number.isFinite(month) || month <= 0) return '';
  return String(Math.ceil(month / 4));
}

function yearFromDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '' : String(date.getFullYear());
}

export function getPreviousTermYear(term: string, year: string) {
  const numericTerm = Number(term || 1);
  const numericYear = Number(year || new Date().getFullYear());
  if (numericTerm > 1) return { term: String(numericTerm - 1), year: String(numericYear) };
  return { term: '3', year: String(numericYear - 1) };
}

export function computeProfitSummary({
  fees,
  payments,
  salaryPayments,
  expenses,
  students = [],
  classes = [],
  term = 'all',
  year = 'all',
  classId = 'all',
  dateFrom = '',
  dateTo = '',
}: ProfitArgs): ProfitSummary {
  const getStudent = (studentId?: string) => students.find((student: any) => student.id === studentId);
  const validClassIds = new Set(classes.map((classItem: any) => classItem.id).filter(Boolean));
  const classWasDeleted = (row: any) => Boolean(row.classId && validClassIds.size > 0 && !validClassIds.has(row.classId));
  const matchesClass = (row: any) => {
    if (classWasDeleted(row)) return false;
    if (classId === 'all') return true;
    const student = getStudent(row.studentId || row.entityId);
    return row.classId === classId || student?.classId === classId;
  };
  const matchesTermYear = (row: any) => {
    if (term !== 'all' && String(row.term || '') !== term) return false;
    if (year !== 'all' && String(row.year || '') !== year) return false;
    return true;
  };

  const scopedFees = fees.filter((fee: any) => matchesTermYear(fee) && matchesClass(fee));
  const scopedFeeIds = new Set(scopedFees.map((fee: any) => fee.id));
  const scopedPayments = payments.filter((payment: any) =>
    scopedFeeIds.has(payment.feeId) &&
    dateInRange(payment.date || payment.createdAt, dateFrom, dateTo)
  );
  const collected = scopedPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  const billed = scopedFees.reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
  const salaryExpense = salaryPayments
    .filter((payment: any) => year === 'all' || String(payment.year || '') === year)
    .filter((payment: any) => term === 'all' || termFromSalaryMonth(payment.month) === term)
    .filter((payment: any) => dateInRange(payment.paidAt || payment.createdAt, dateFrom, dateTo))
    .reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
  const recordedExpense = expenses
    .filter((expense: any) => dateInRange(expense.date || expense.createdAt, dateFrom, dateTo))
    .filter((expense: any) => year === 'all' || yearFromDate(expense.date || expense.createdAt) === year)
    .filter((expense: any) => term === 'all' || termFromDate(expense.date || expense.createdAt) === term)
    .reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0);
  const totalExpenses = salaryExpense + recordedExpense;
  const netProfit = collected - totalExpenses;
  const unpaid = Math.max(0, billed - collected);
  const amountNeededForProfit = Math.max(0, totalExpenses - collected);
  return { billed, collected, totalExpenses, netProfit, unpaid, amountNeededForProfit };
}

export function getGrowthPercent(current: number, previous: number) {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  if (current > 0) return 100;
  if (current < 0) return -100;
  return 0;
}
