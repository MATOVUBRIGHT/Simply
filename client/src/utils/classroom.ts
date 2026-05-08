import type { Class, Student } from '@schofy/shared';
import { dataService } from '../lib/database/SupabaseDataService';

export interface ClassOption {
  id: string;
  name: string;
  capacity: number;
  enrolled: number;
  remaining: number;
  isFull: boolean;
}

// ── Section ordering ──────────────────────────────────────────────────────────
// Classes are grouped into sections: Nursery → Primary → Secondary (JSS → SS).
// Within each section they sort by level ascending.
// This ensures Baby/Nursery/Middle/Top never mix with P.1-P.7 or S.1-S.6.

const NURSERY_NAMES = new Set(['baby', 'nursery', 'middle', 'top', 'pre-k', 'kg', 'kindergarten', 'reception']);

export function getClassSection(cls: { name?: string; level?: number }): number {
  const name = (cls.name || '').toLowerCase().trim();
  const level = cls.level ?? 0;

  // Explicit nursery names always go first
  if (NURSERY_NAMES.has(name)) return 0;

  // Level-based section mapping (matches Settings.tsx CLASS_MAP offsets)
  if (level >= 1  && level <= 4)  return 0; // Nursery
  if (level >= 5  && level <= 11) return 1; // Primary
  if (level >= 12 && level <= 17) return 2; // JSS / Lower Secondary
  if (level >= 18)                return 3; // SS / Upper Secondary

  // Name-based fallback
  if (name.startsWith('p.') || name.startsWith('p ') || name.startsWith('primary')) return 1;
  if (name.startsWith('s.') || name.startsWith('s ') || name.startsWith('jss') || name.startsWith('ss')) return 2;

  return 1; // default to primary
}

export const SECTION_LABELS: Record<number, string> = {
  0: 'Nursery',
  1: 'Primary',
  2: 'Secondary (JSS)',
  3: 'Secondary (SS)',
};

/**
 * Sort classes: Nursery first, then Primary, then Secondary (JSS), then SS.
 * Within each section, sort by level ascending.
 * Use this everywhere instead of raw `.sort((a,b) => a.level - b.level)`.
 */
export function sortClassesBySectionThenLevel<T extends { name?: string; level?: number }>(classes: T[]): T[] {
  return [...classes].sort((a, b) => {
    const sa = getClassSection(a);
    const sb = getClassSection(b);
    if (sa !== sb) return sa - sb;
    return (a.level ?? 0) - (b.level ?? 0);
  });
}

/**
 * Group classes by section, returning an array of { section, label, classes }.
 * Useful for rendering grouped dropdowns and lists.
 */
export function groupClassesBySection<T extends { name?: string; level?: number }>(
  classes: T[]
): { section: number; label: string; classes: T[] }[] {
  const sorted = sortClassesBySectionThenLevel(classes);
  const map = new Map<number, T[]>();
  for (const cls of sorted) {
    const s = getClassSection(cls);
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push(cls);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([section, classes]) => ({ section, label: SECTION_LABELS[section] ?? 'Other', classes }));
}

const LEGACY_CLASS_OPTIONS = [
  { id: 'primary-1', name: 'Primary 1' },
  { id: 'primary-2', name: 'Primary 2' },
  { id: 'primary-3', name: 'Primary 3' },
  { id: 'primary-4', name: 'Primary 4' },
  { id: 'primary-5', name: 'Primary 5' },
  { id: 'primary-6', name: 'Primary 6' },
  { id: 'jss-1', name: 'JSS 1' },
  { id: 'jss-2', name: 'JSS 2' },
  { id: 'jss-3', name: 'JSS 3' },
  { id: 'ss-1', name: 'SS 1' },
  { id: 'ss-2', name: 'SS 2' },
  { id: 'ss-3', name: 'SS 3' },
];

function countsTowardCapacity(student: Pick<Student, 'status'>) {
  return student.status !== 'completed';
}


export function getClassDisplayName(
  classId: string | null | undefined,
  classes: Pick<Class, 'id' | 'name' | 'stream'>[] = [],
) {
  if (!classId) {
    return 'Not assigned';
  }

  const matchingClass = classes.find((classItem) => classItem.id === classId);
  if (matchingClass) {
    return matchingClass.stream
      ? `${matchingClass.name} - Stream ${matchingClass.stream}`
      : matchingClass.name;
  }

  // Return "Not assigned" for non-existing classes instead of fallback formatting
  return 'Not assigned';
}

export async function getStudentClassOptions(userId: string, excludeStudentId?: string): Promise<ClassOption[]> {
  const [classes, students] = await Promise.all([
    dataService.getAll(userId, 'classes'),
    dataService.getAll(userId, 'students'),
  ]);

  const relevantStudents = students.filter(
    (student) => student.id !== excludeStudentId && countsTowardCapacity(student),
  );

  if (classes.length === 0) {
    return LEGACY_CLASS_OPTIONS.map((classItem) => {
      const enrolled = relevantStudents.filter((student) => student.classId === classItem.id).length;
      const capacity = 40;
      return {
        id: classItem.id,
        name: classItem.name,
        capacity,
        enrolled,
        remaining: Math.max(0, capacity - enrolled),
        isFull: enrolled >= capacity,
      };
    });
  }

  return classes
    .map((classItem) => {
      const enrolled = relevantStudents.filter((student) => student.classId === classItem.id).length;
      const capacity = classItem.capacity || 0;

      return {
        id: classItem.id,
        name: classItem.stream ? `${classItem.name} - Stream ${classItem.stream}` : classItem.name,
        capacity,
        enrolled,
        remaining: Math.max(0, capacity - enrolled),
        isFull: enrolled >= capacity,
        // temp fields for section sort
        _level: (classItem as any).level ?? 0,
        _name: (classItem as any).name ?? '',
      };
    })
    .sort((left, right) => {
      const sa = getClassSection({ name: left._name, level: left._level });
      const sb = getClassSection({ name: right._name, level: right._level });
      if (sa !== sb) return sa - sb;
      return left._level - right._level;
    })
    .map(({ _level, _name, ...rest }) => rest) as ClassOption[];
}

export async function getClassCapacityState(userId: string, classId: string, excludeStudentId?: string) {
  const options = await getStudentClassOptions(userId, excludeStudentId);
  return options.find((option) => option.id === classId) || null;
}

/**
 * Validates student class assignments and returns statistics
 */
export async function validateStudentClassAssignments(userId: string) {
  const [classes, students] = await Promise.all([
    dataService.getAll(userId, 'classes'),
    dataService.getAll(userId, 'students'),
  ]);

  const classIds = new Set(classes.map(c => c.id));
  const validAssignments = students.filter(s => !s.classId || classIds.has(s.classId));
  const invalidAssignments = students.filter(s => s.classId && !classIds.has(s.classId));

  return {
    totalStudents: students.length,
    validAssignments: validAssignments.length,
    invalidAssignments: invalidAssignments.length,
    invalidStudents: invalidAssignments,
    availableClasses: classes,
  };
}

/**
 * Fixes invalid class assignments by setting them to null
 */
export async function fixInvalidClassAssignments(userId: string) {
  const validation = await validateStudentClassAssignments(userId);
  
  if (validation.invalidAssignments === 0) {
    return { fixed: 0, message: 'All class assignments are valid' };
  }

  let fixed = 0;
  for (const student of validation.invalidStudents) {
    try {
      await dataService.update(userId, 'students', student.id, { classId: null } as any);
      fixed++;
    } catch (error) {
      console.error(`Failed to fix class assignment for student ${student.id}:`, error);
    }
  }

  return { 
    fixed, 
    message: `Fixed ${fixed} invalid class assignments` 
  };
}
