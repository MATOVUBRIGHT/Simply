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
const NURSERY_ORDER = ['baby', 'nursery', 'middle', 'top', 'pre-k', 'kg', 'kindergarten', 'reception'];

function classSortValue(cls: { name?: string; level?: number }) {
  const rawName = (cls.name || '').toLowerCase().trim();
  const level = Number(cls.level || 0);
  const nurseryIndex = NURSERY_ORDER.findIndex(name => rawName === name || rawName.startsWith(`${name} `));
  if (nurseryIndex >= 0) return nurseryIndex + 1;

  const primaryMatch = rawName.match(/(?:^p\.?\s*|primary\s*)(\d+)/);
  if (primaryMatch) return 100 + Number(primaryMatch[1]);

  const secondaryMatch = rawName.match(/(?:^s\.?\s*|^ss\s*|^jss\s*)(\d+)/);
  if (secondaryMatch) return 200 + Number(secondaryMatch[1]);

  return level > 0 ? level : 999;
}

export function getClassSection(cls: { name?: string; level?: number }): number {
  const name = (cls.name || '').toLowerCase().trim();
  const level = cls.level ?? 0;

  // Explicit nursery names always go first
  if (NURSERY_NAMES.has(name)) return 0;

  // Explicit class names should win over legacy level values. Some older
  // schools stored P.1-P.7 or S.1-S.6 as levels 1-7 / 1-6.
  if (name.startsWith('p.') || name.startsWith('p ') || name.startsWith('primary')) return 1;
  if (name.startsWith('jss')) return 2;
  if (name.startsWith('ss')) return 2;
  if (name.startsWith('s.') || name.startsWith('s ')) return 2;

  // Level-based section mapping (matches Settings.tsx CLASS_MAP offsets)
  if (level >= 1  && level <= 4)  return 0; // Nursery
  if (level >= 5  && level <= 11) return 1; // Primary
  if (level >= 12)                return 2; // Secondary

  return 1; // default to primary
}

export const SECTION_LABELS: Record<number, string> = {
  0: 'Nursery',
  1: 'Primary',
  2: 'Secondary',
};

/**
 * Sort classes: Nursery first, then Primary, then Secondary.
 * Within each section, sort by level ascending.
 * Use this everywhere instead of raw `.sort((a,b) => a.level - b.level)`.
 */
export function sortClassesBySectionThenLevel<T extends { name?: string; level?: number }>(classes: T[]): T[] {
  return [...classes].sort((a, b) => {
    const sa = getClassSection(a);
    const sb = getClassSection(b);
    if (sa !== sb) return sa - sb;
    const valueA = classSortValue(a);
    const valueB = classSortValue(b);
    if (valueA !== valueB) return valueA - valueB;
    const nameCompare = String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    if (nameCompare !== 0) return nameCompare;
    return String((a as any).stream || '').localeCompare(String((b as any).stream || ''), undefined, { numeric: true, sensitivity: 'base' });
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

function normalizeClassToken(value: unknown): string {
  const wordNumbers: Record<string, string> = {
    baby: 'baby',
    middle: 'middle',
    top: 'top',
    nursery: 'nursery',
    kg: 'kg',
    kindergarten: 'kg',
    reception: 'reception',
    zero: '0',
    one: '1',
    first: '1',
    two: '2',
    second: '2',
    three: '3',
    third: '3',
    four: '4',
    fourth: '4',
    five: '5',
    fifth: '5',
    six: '6',
    sixth: '6',
    seven: '7',
    seventh: '7',
    eight: '8',
    eighth: '8',
    nine: '9',
    ninth: '9',
    ten: '10',
    tenth: '10',
    eleven: '11',
    eleventh: '11',
    twelve: '12',
    twelfth: '12',
    thirteen: '13',
    thirteenth: '13',
  };
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\b(class|grade|level|standard|std|year)\b/g, '')
    .replace(/\b(primary|pri|pry)\b/g, 'p')
    .replace(/\b(senior secondary|secondary|senior)\b/g, 's')
    .replace(/\bjunior secondary\b/g, 'jss')
    .replace(/\b(baby class)\b/g, 'baby')
    .replace(/\b([a-z]+)\b/g, part => wordNumbers[part] || part)
    .replace(/[^a-z0-9]+/g, '');
}

function addClassAlias(aliases: Map<string, string>, candidate: unknown, classId: string, prefer = false) {
  const key = normalizeClassToken(candidate);
  if (key && (prefer || !aliases.has(key))) aliases.set(key, classId);
}

function addClassCandidate(candidates: Map<string, Set<string>>, candidate: unknown, classId: string) {
  const key = normalizeClassToken(candidate);
  if (!key) return;
  if (!candidates.has(key)) candidates.set(key, new Set());
  candidates.get(key)!.add(classId);
}

function addLevelAliases(
  preferredAliases: Map<string, string>,
  exactAliases: Map<string, string>,
  ambiguousAliases: Map<string, Set<string>>,
  classId: string,
  level: number,
  stream?: string,
) {
  if (!Number.isFinite(level) || level <= 0) return;
  const baseAliases: string[] = [];
  if (level <= 6) {
    baseAliases.push(`${level}`, `p${level}`, `p.${level}`, `p ${level}`, `p-${level}`, `primary ${level}`, `primary.${level}`, `primary-${level}`);
  } else if (level <= 9) {
    const n = level - 6;
    baseAliases.push(`jss${n}`, `jss ${n}`, `jss.${n}`, `jss-${n}`, `junior secondary ${n}`);
  } else if (level <= 12) {
    const n = level - 9;
    baseAliases.push(`s${n}`, `s.${n}`, `s ${n}`, `ss${n}`, `ss ${n}`, `ss.${n}`, `secondary ${n}`, `senior ${n}`);
  }

  for (const alias of baseAliases) {
    if (!stream) addClassAlias(preferredAliases, alias, classId, true);
    addClassCandidate(ambiguousAliases, alias, classId);
    if (stream) {
      addClassAlias(exactAliases, `${alias} ${stream}`, classId, true);
      addClassAlias(exactAliases, `${alias} stream ${stream}`, classId, true);
    }
  }
}

export function resolveClassIdFromText(
  rawValue: unknown,
  classes: Pick<Class, 'id' | 'name' | 'stream' | 'level'>[] = [],
  streamValue?: unknown,
) {
  const normalized = normalizeClassToken(rawValue);
  const normalizedStream = normalizeClassToken(streamValue);
  if (!normalized && !normalizedStream) return '';

  const exactAliases = new Map<string, string>();
  const preferredBaseAliases = new Map<string, string>();
  const ambiguousBaseAliases = new Map<string, Set<string>>();
  for (const classItem of classes) {
    const name = classItem.name || '';
    const stream = String((classItem as any).stream || '').trim();
    addClassAlias(exactAliases, classItem.id, classItem.id, true);
    if (!stream) addClassAlias(preferredBaseAliases, name, classItem.id, true);
    addClassCandidate(ambiguousBaseAliases, name, classItem.id);
    [
      stream ? `${name} ${stream}` : '',
      stream ? `${name} stream ${stream}` : '',
      stream ? `${name} - ${stream}` : '',
      stream ? `${name} - Stream ${stream}` : '',
    ].forEach(candidate => addClassAlias(exactAliases, candidate, classItem.id, true));

    const primaryMatch = name.match(/(?:^p\.?\s*|primary\s*)(\d+)/i);
    if (primaryMatch) {
      [`p${primaryMatch[1]}`, `p.${primaryMatch[1]}`, `primary ${primaryMatch[1]}`].forEach(candidate => {
        if (!stream) addClassAlias(preferredBaseAliases, candidate, classItem.id, true);
        addClassCandidate(ambiguousBaseAliases, candidate, classItem.id);
      });
    }

    const jssMatch = name.match(/(?:^jss\s*|junior\s*secondary\s*)(\d+)/i);
    if (jssMatch) {
      [`jss${jssMatch[1]}`, `jss.${jssMatch[1]}`, `junior secondary ${jssMatch[1]}`].forEach(candidate => {
        if (!stream) addClassAlias(preferredBaseAliases, candidate, classItem.id, true);
        addClassCandidate(ambiguousBaseAliases, candidate, classItem.id);
      });
    }

    const secondaryMatch = name.match(/(?:^s\.?\s*|^ss\s*|secondary\s*)(\d+)/i);
    if (secondaryMatch) {
      [`s${secondaryMatch[1]}`, `ss${secondaryMatch[1]}`, `secondary ${secondaryMatch[1]}`].forEach(candidate => {
        if (!stream) addClassAlias(preferredBaseAliases, candidate, classItem.id, true);
        addClassCandidate(ambiguousBaseAliases, candidate, classItem.id);
      });
    }

    addLevelAliases(preferredBaseAliases, exactAliases, ambiguousBaseAliases, classItem.id, Number((classItem as any).level || 0), stream);
  }

  const exactLookupKeys = [
    normalized && normalizedStream ? normalizeClassToken(`${rawValue} ${streamValue}`) : '',
    normalized && normalizedStream ? normalizeClassToken(`${rawValue} stream ${streamValue}`) : '',
  ].filter(Boolean);

  for (const key of exactLookupKeys) {
    const match = exactAliases.get(key);
    if (match) return match;
  }

  const idMatch = exactAliases.get(normalized);
  if (idMatch) return idMatch;

  const preferredBaseMatch = preferredBaseAliases.get(normalized);
  if (preferredBaseMatch) return preferredBaseMatch;

  const candidates = ambiguousBaseAliases.get(normalized);
  if (candidates && candidates.size === 1) return Array.from(candidates)[0];

  return '';
}

function getStudentClassHints(student: any): unknown[] {
  return [
    student.classId,
    student.className,
    student.class,
    student.grade,
    student.level,
    student.form,
    student.currentClass,
    student.assignedClass,
  ].filter(value => String(value ?? '').trim());
}

async function getOrCreateUnassignedClass(userId: string, classes: Class[]): Promise<Class> {
  const existing = classes.find(classItem =>
    normalizeClassToken(classItem.name) === normalizeClassToken('Unassigned') ||
    normalizeClassToken(classItem.id) === normalizeClassToken('unassigned')
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const newClass: Class = {
    id: 'unassigned',
    schoolId: userId,
    name: 'Unassigned',
    level: 0,
    stream: '',
    capacity: 100000,
    createdAt: now,
  };
  await dataService.create(userId, 'classes', newClass);
  classes.push(newClass);
  return newClass;
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
        _stream: (classItem as any).stream ?? '',
      };
    })
    .sort((left, right) => {
      const sa = getClassSection({ name: left._name, level: left._level });
      const sb = getClassSection({ name: right._name, level: right._level });
      if (sa !== sb) return sa - sb;
      const valueA = classSortValue({ name: left._name, level: left._level });
      const valueB = classSortValue({ name: right._name, level: right._level });
      if (valueA !== valueB) return valueA - valueB;
      const nameCompare = String(left._name || '').localeCompare(String(right._name || ''), undefined, { numeric: true, sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return String(left._stream || '').localeCompare(String(right._stream || ''), undefined, { numeric: true, sensitivity: 'base' });
    })
    .map(({ _level, _name, _stream, ...rest }) => rest) as ClassOption[];
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
  const validAssignments = students.filter(s => s.classId && classIds.has(s.classId));
  const invalidAssignments = students.filter(s => s.classId && !classIds.has(s.classId));
  const unassignedStudents = students.filter(s => !s.classId);
  const studentsNeedingClassFix = [...invalidAssignments, ...unassignedStudents];
  const repairableAssignments = invalidAssignments
    .map(student => ({
      student,
      classId: resolveClassIdFromText(student.classId, classes, (student as any).stream),
    }))
    .filter(item => item.classId);
  const repairableUnassigned = unassignedStudents
    .map(student => {
      const classId = getStudentClassHints(student)
        .map(hint => resolveClassIdFromText(hint, classes, (student as any).stream))
        .find(Boolean) || '';
      return { student, classId };
    })
    .filter(item => item.classId);

  return {
    totalStudents: students.length,
    validAssignments: validAssignments.length,
    invalidAssignments: studentsNeedingClassFix.length,
    missingAssignments: unassignedStudents.length,
    brokenAssignments: invalidAssignments.length,
    repairableAssignments: repairableAssignments.length + repairableUnassigned.length,
    unrepairableAssignments: studentsNeedingClassFix.length - repairableAssignments.length - repairableUnassigned.length,
    invalidStudents: studentsNeedingClassFix,
    repairableStudents: [...repairableAssignments, ...repairableUnassigned],
    availableClasses: classes,
  };
}

/**
 * Fixes invalid class assignments by matching known class formats first, then moving unmatched records to Unassigned.
 */
export async function fixInvalidClassAssignments(
  userId: string,
  onProgress?: (progress: number, processed: number, total: number, detail: string) => void,
) {
  const validation = await validateStudentClassAssignments(userId);
  
  if (validation.invalidAssignments === 0) {
    onProgress?.(100, 0, 0, 'All class assignments are valid');
    return { fixed: 0, repaired: 0, assignedFallback: 0, cleared: 0, message: 'All class assignments are valid' };
  }

  let repaired = 0;
  let assignedFallback = 0;
  let cleared = 0;
  const failures: Array<{ studentId: string; error: unknown }> = [];
  const fallbackClass = validation.unrepairableAssignments > 0
    ? await getOrCreateUnassignedClass(userId, validation.availableClasses)
    : null;
  const repairByStudentId = new Map(validation.repairableStudents.map(item => [item.student.id, item.classId]));
  const total = validation.invalidStudents.length;
  let processed = 0;
  onProgress?.(5, 0, total, 'Preparing class fixes');

  const updateStudentClass = async (student: Student, classId: string | null) => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await dataService.update(userId, 'students', student.id, { classId } as any);
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, attempt * 120));
      }
    }
    throw lastError;
  };

  for (const student of validation.invalidStudents) {
    const repairedClassId = repairByStudentId.get(student.id);
    const targetClassId = repairedClassId || fallbackClass?.id || null;
    const detailName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.studentId || student.id;

    try {
      await updateStudentClass(student, targetClassId);
      if (repairedClassId) repaired++;
      else if (fallbackClass) assignedFallback++;
      else cleared++;
    } catch (error) {
      console.error(`Failed to fix class assignment for student ${student.id}:`, error);
      failures.push({ studentId: student.id, error });
    } finally {
      processed++;
      onProgress?.(Math.max(5, Math.round((processed / total) * 100)), processed, total, `Fixed class for ${detailName}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const finalValidation = await validateStudentClassAssignments(userId);
  if (failures.length > 0 || finalValidation.invalidAssignments > 0) {
    throw new Error(`Could not fix ${Math.max(failures.length, finalValidation.invalidAssignments)} class assignment${Math.max(failures.length, finalValidation.invalidAssignments) === 1 ? '' : 's'}. Please try again.`);
  }

  const parts: string[] = [];
  if (repaired > 0) parts.push(`${repaired} matched to existing class${repaired === 1 ? '' : 'es'}`);
  if (assignedFallback > 0) parts.push(`${assignedFallback} moved to Unassigned`);
  if (cleared > 0) parts.push(`${cleared} set to No class`);
  onProgress?.(100, total, total, 'Class fixes complete');

  return { 
    fixed: repaired + assignedFallback + cleared,
    repaired,
    assignedFallback,
    cleared,
    message: parts.length > 0 ? `Fixed class assignments: ${parts.join(', ')}` : 'No class assignments were changed',
  };
}
