import { dataService } from '../lib/database/DataService';
import { FeeStructure, Fee, FeeCategory } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';

export interface FeeStructureWithTotal extends FeeStructure {
  totalAmount: number;
}

export async function getFeeStructuresByClass(
  userId: string,
  classId: string,
  term?: string,
  year?: string
): Promise<FeeStructure[]> {
  const all = await dataService.getAll(userId, 'feeStructures');
  return all.filter((s: FeeStructure) => {
    if (s.classId !== classId) return false;
    if (term && s.term !== term) return false;
    if (year && s.year !== year) return false;
    return true;
  });
}

export async function getAllFeeStructures(
  userId: string,
  term?: string,
  year?: string
): Promise<FeeStructure[]> {
  const all = await dataService.getAll(userId, 'feeStructures');
  return all.filter((s: FeeStructure) => {
    if (term && s.term !== term) return false;
    if (year && s.year !== year) return false;
    return true;
  });
}

export async function createFeeStructure(
  userId: string,
  classId: string,
  name: string,
  category: FeeCategory,
  amount: number,
  term: string,
  year: string,
  isRequired = true,
  description?: string
): Promise<FeeStructure> {
  const existing = await dataService.getAll(userId, 'feeStructures');
  const duplicate = existing.find((s: FeeStructure) =>
    s.classId === classId &&
    s.name?.toLowerCase() === name?.toLowerCase() &&
    s.category === category &&
    s.term === term &&
    s.year === year
  );
  if (duplicate) {
    throw new Error('DUPLICATE_FEE_STRUCTURE');
  }

  const structure: FeeStructure = {
    id: uuidv4(),
    classId,
    name,
    category,
    amount,
    isRequired,
    term,
    year,
    description,
    createdAt: new Date().toISOString(),
  };
  await dataService.create(userId, 'feeStructures', structure as any);
  return structure;
}

export async function updateFeeStructure(
  userId: string,
  id: string,
  updates: Partial<FeeStructure>
): Promise<void> {
  const existing = await dataService.get(userId, 'feeStructures', id);
  if (existing) {
    await dataService.update(userId, 'feeStructures', id, {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    } as any);
  }
}

export async function deleteFeeStructure(userId: string, id: string): Promise<void> {
  await dataService.delete(userId, 'feeStructures', id);
}

export async function bulkCreateFeeStructures(
  userId: string,
  classId: string,
  structures: Omit<FeeStructure, 'id' | 'classId' | 'createdAt' | 'updatedAt'>[]
): Promise<FeeStructure[]> {
  const now = new Date().toISOString();
  const created: FeeStructure[] = structures.map(s => ({
    ...s,
    id: uuidv4(),
    classId,
    createdAt: now,
  }));
  for (const s of created) {
    await dataService.create(userId, 'feeStructures', s as any);
  }
  return created;
}

export async function copyFeeStructuresToClass(
  userId: string,
  fromClassId: string,
  toClassId: string,
  term: string,
  year: string
): Promise<FeeStructure[]> {
  const source = await getFeeStructuresByClass(userId, fromClassId, term, year);
  const copied: FeeStructure[] = source.map(s => ({
    ...s,
    id: uuidv4(),
    classId: toClassId,
    term,
    year,
    createdAt: new Date().toISOString(),
    updatedAt: undefined,
  }));
  for (const s of copied) {
    await dataService.create(userId, 'feeStructures', s as any);
  }
  return copied;
}

export async function generateInvoicesFromStructure(
  userId: string,
  classId: string,
  term: string,
  year: string
): Promise<{ fees: Fee[]; studentsCount: number }> {
  const structures = await getFeeStructuresByClass(userId, classId, term, year);
  if (structures.length === 0) return { fees: [], studentsCount: 0 };

  const [students, allBursaries, allDiscounts] = await Promise.all([
    dataService.getAll(userId, 'students'),
    dataService.getAll(userId, 'bursaries'),
    dataService.getAll(userId, 'discounts'),
  ]);

  const active = students.filter(
    (s: any) =>
      s.classId === classId &&
      s.status !== 'completed' &&
      s.status !== 'graduated'
  );
  if (active.length === 0) return { fees: [], studentsCount: 0 };

  const termBursaries = allBursaries.filter(
    (b: any) => b.term === term && b.year === year
  );
  const classDiscount = allDiscounts.find(
    (d: any) => d.classId === classId && d.term === term && d.year === year
  );
  const applicable = structures.filter(
    s =>
      s.isRequired ||
      s.category === FeeCategory.TUITION ||
      s.category === FeeCategory.BOARDING
  );
  const baseTotal = applicable.reduce((sum, s) => sum + s.amount, 0);
  const now = new Date().toISOString();
  const fees: Fee[] = [];

  for (const student of active) {
    const bursary = termBursaries.find((b: any) => b.studentId === student.id);

    if (bursary) {
      fees.push({
        id: uuidv4(),
        studentId: student.id,
        classId,
        description: `Bursary Invoice (${applicable.map(s => s.name).join(', ')})`,
        amount: bursary.amount,
        term,
        year,
        createdAt: now,
      });
      continue;
    }

    for (const structure of applicable) {
      let amount = structure.amount;
      let description = structure.name;
      if (classDiscount) {
        if (classDiscount.type === 'percentage') {
          amount = Math.max(0, amount - (amount * classDiscount.amount) / 100);
          description += ` (Discount: ${classDiscount.amount}%)`;
        } else {
          const share = baseTotal > 0 ? structure.amount / baseTotal : 0;
          amount = Math.max(0, amount - classDiscount.amount * share);
        }
      }
      fees.push({
        id: uuidv4(),
        studentId: student.id,
        classId,
        description,
        amount,
        term,
        year,
        createdAt: now,
      });
    }
  }

  for (const fee of fees) {
    await dataService.create(userId, 'fees', fee as any);
  }
  return { fees, studentsCount: active.length };
}

export async function getClassFeeSummary(
  userId: string,
  classId: string,
  term: string,
  year: string
): Promise<{
  structures: FeeStructure[];
  totalPerStudent: number;
  requiredTotal: number;
  optionalTotal: number;
  studentCount: number;
}> {
  const structures = await getFeeStructuresByClass(userId, classId, term, year);
  const students = await dataService.getAll(userId, 'students');
  const active = students.filter(
    (s: any) =>
      s.classId === classId &&
      s.status !== 'completed' &&
      s.status !== 'graduated'
  );
  const requiredTotal = structures
    .filter(s => s.isRequired)
    .reduce((sum, s) => sum + s.amount, 0);
  const optionalTotal = structures
    .filter(s => !s.isRequired)
    .reduce((sum, s) => sum + s.amount, 0);
  return {
    structures,
    totalPerStudent: requiredTotal + optionalTotal,
    requiredTotal,
    optionalTotal,
    studentCount: active.length,
  };
}

export function getCategoryLabel(category: FeeCategory): string {
  const labels: Record<FeeCategory, string> = {
    [FeeCategory.TUITION]: 'Tuition',
    [FeeCategory.BOARDING]: 'Boarding',
    [FeeCategory.EXAM]: 'Examination',
    [FeeCategory.REGISTRATION]: 'Registration',
    [FeeCategory.UNIFORM]: 'Uniform',
    [FeeCategory.BOOKS]: 'Books & Materials',
    [FeeCategory.TRANSPORT]: 'Transport',
    [FeeCategory.ACTIVITY]: 'Activity Fee',
    [FeeCategory.OTHER]: 'Other',
  };
  return labels[category] || category;
}

export function getCategoryColor(category: FeeCategory): string {
  const colors: Record<FeeCategory, string> = {
    [FeeCategory.TUITION]: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    [FeeCategory.BOARDING]: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    [FeeCategory.EXAM]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    [FeeCategory.REGISTRATION]: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    [FeeCategory.UNIFORM]: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    [FeeCategory.BOOKS]: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    [FeeCategory.TRANSPORT]: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    [FeeCategory.ACTIVITY]: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    [FeeCategory.OTHER]: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  };
  return colors[category] || colors[FeeCategory.OTHER];
}
