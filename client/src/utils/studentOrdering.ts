import type { Student } from '@schofy/shared';

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function compareText(left: unknown, right: unknown): number {
  return collator.compare(text(left), text(right));
}

export function compareStudentsForList(left: Student, right: Student): number {
  return (
    compareText((left as any).classId, (right as any).classId) ||
    compareText((left as any).admissionNo || (left as any).studentId, (right as any).admissionNo || (right as any).studentId) ||
    compareText((left as any).firstName, (right as any).firstName) ||
    compareText((left as any).lastName, (right as any).lastName) ||
    compareText((left as any).createdAt, (right as any).createdAt) ||
    compareText((left as any).id, (right as any).id)
  );
}

export function sortStudentsForList<T extends Student>(students: T[]): T[] {
  return [...students].sort(compareStudentsForList);
}
