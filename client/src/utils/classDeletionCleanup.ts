import { dataService } from '../lib/database/SupabaseDataService';
import { deleteInThirtyPercentBatches, runTasksInPercentBatches, runTasksInThirtyPercentBatches } from './bulkDelete';

type CleanupCounts = {
  studentsUnassigned: number;
  recordsDeleted: number;
};

async function getAllSafe(userId: string, tableName: string) {
  try {
    return await dataService.getAll(userId, tableName);
  } catch {
    return [];
  }
}

async function deleteIds(userId: string, tableName: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return 0;
  await deleteInThirtyPercentBatches(userId, tableName, uniqueIds);
  return uniqueIds.length;
}

function dispatchClassCleanupRefresh(tables: string[]) {
  const uniqueTables = Array.from(new Set(['classes', 'students', ...tables]));
  window.dispatchEvent(new CustomEvent('classesUpdated'));
  window.dispatchEvent(new CustomEvent('classesDataChanged'));
  window.dispatchEvent(new CustomEvent('dataRefresh'));
  uniqueTables.forEach(table => {
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table } }));
    window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table } }));
  });
}

export async function cleanupDeletedClassReferences(userId: string, classIds: string[]): Promise<CleanupCounts> {
  const classSet = new Set(classIds.filter(Boolean));
  if (classSet.size === 0) return { studentsUnassigned: 0, recordsDeleted: 0 };

  const [
    students,
    fees,
    payments,
    feeStructures,
    invoices,
    discounts,
    subjects,
    timetable,
    exams,
    examResults,
    homework,
    transportAssignments,
  ] = await Promise.all([
    getAllSafe(userId, 'students'),
    getAllSafe(userId, 'fees'),
    getAllSafe(userId, 'payments'),
    getAllSafe(userId, 'feeStructures'),
    getAllSafe(userId, 'invoices'),
    getAllSafe(userId, 'discounts'),
    getAllSafe(userId, 'subjects'),
    getAllSafe(userId, 'timetable'),
    getAllSafe(userId, 'exams'),
    getAllSafe(userId, 'examResults'),
    getAllSafe(userId, 'homework'),
    getAllSafe(userId, 'transportAssignments'),
  ]);

  const now = new Date().toISOString();
  const studentsToUnassign = students.filter((student: any) => classSet.has(student.classId));
  await runTasksInThirtyPercentBatches(
    studentsToUnassign.map((student: any) => () =>
      dataService.update(userId, 'students', student.id, {
        ...student,
        classId: '',
        updatedAt: now,
      })
    )
  );

  const feesToDelete = fees.filter((fee: any) => classSet.has(fee.classId)).map((fee: any) => fee.id);
  const feeIdSet = new Set(feesToDelete);
  const examsToDelete = exams.filter((exam: any) => classSet.has(exam.classId)).map((exam: any) => exam.id);
  const examIdSet = new Set(examsToDelete);

  const deletePlan: Array<[string, string[]]> = [
    ['payments', payments.filter((payment: any) => feeIdSet.has(payment.feeId)).map((payment: any) => payment.id)],
    ['fees', feesToDelete],
    ['feeStructures', feeStructures.filter((item: any) => classSet.has(item.classId)).map((item: any) => item.id)],
    ['invoices', invoices.filter((invoice: any) => classSet.has(invoice.classId)).map((invoice: any) => invoice.id)],
    ['discounts', discounts.filter((discount: any) => classSet.has(discount.classId)).map((discount: any) => discount.id)],
    ['subjects', subjects.filter((subject: any) => classSet.has(subject.classId)).map((subject: any) => subject.id)],
    ['timetable', timetable.filter((entry: any) => classSet.has(entry.classId)).map((entry: any) => entry.id)],
    ['examResults', examResults.filter((result: any) => examIdSet.has(result.examId)).map((result: any) => result.id)],
    ['exams', examsToDelete],
    ['homework', homework.filter((item: any) => classSet.has(item.classId)).map((item: any) => item.id)],
    ['transportAssignments', transportAssignments.filter((item: any) => classSet.has(item.classId)).map((item: any) => item.id)],
  ];

  const criticalDeleteGroups: Array<Array<[string, string[]]>> = [
    [deletePlan[0]],
    [deletePlan[7]],
    deletePlan.filter((_, index) => index !== 0 && index !== 7),
  ];

  let recordsDeleted = 0;
  for (const group of criticalDeleteGroups) {
    const counts = await runTasksInPercentBatches(
      group.map(([tableName, ids]) => () => deleteIds(userId, tableName, ids)),
      1
    );
    recordsDeleted += counts.reduce((sum, count) => sum + count, 0);
  }

  dispatchClassCleanupRefresh(deletePlan.map(([tableName]) => tableName));
  return { studentsUnassigned: studentsToUnassign.length, recordsDeleted };
}
