import { matchesTextSearch, normalizeSearchValue } from './searchMatch';

export function studentSearchText(student: any, extra: string[] = []): string {
  const first = String(student?.firstName || '').trim();
  const last = String(student?.lastName || '').trim();
  const full = `${first} ${last}`.trim();
  const reversed = `${last} ${first}`.trim();
  return [
    first,
    last,
    full,
    reversed,
    student?.studentId,
    student?.admissionNo,
    student?.id,
    ...extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export function matchesStudentSearch(student: any, query: string, extra: string[] = []): boolean {
  const q = normalizeSearchValue(query);
  if (!q) return true;
  return matchesTextSearch(studentSearchText(student, extra), q);
}
