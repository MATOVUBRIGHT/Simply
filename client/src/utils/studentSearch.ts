import { matchesTextSearch, normalizeSearchValue } from './searchMatch';

export function getStudentDisplayId(student: any): string {
  return String(student?.studentId || student?.admissionNo || '').trim();
}

export function studentSearchText(student: any, extra: string[] = []): string {
  const first = String(student?.firstName || '').trim();
  const last = String(student?.lastName || '').trim();
  const full = `${first} ${last}`.trim();
  const reversed = `${last} ${first}`.trim();
  const displayId = getStudentDisplayId(student);
  return [
    first,
    last,
    full,
    reversed,
    displayId,
    student?.admissionNo,
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
