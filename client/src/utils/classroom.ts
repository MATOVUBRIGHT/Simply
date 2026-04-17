import type { Class, Student } from '@schofy/shared';
import { dataService } from '../lib/database/DataService';

export interface ClassOption {
  id: string;
  name: string;
  capacity: number;
  enrolled: number;
  remaining: number;
  isFull: boolean;
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
      };
    })
    .sort((left, right) => {
      const leftClass = classes.find(c => c.id === left.id);
      const rightClass = classes.find(c => c.id === right.id);
      return (leftClass?.level || 0) - (rightClass?.level || 0);
    });
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
