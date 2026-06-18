import type { Student } from '@schofy/shared';

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function text(value: unknown): string {
  return String(value ?? '').trim();
}

// Optimized sort using Schwartzian transform for large datasets
export function sortStudentsForList<T extends Student>(students: T[]): T[] {
  if (students.length <= 1) {
    return [...students];
  }

  // Precompute keys for each student
  const studentsWithKeys = students.map((student) => {
    const s = student as any;
    return {
      student,
      key1: text(s.classId),
      key2: text(s.admissionNo || s.studentId),
      key3: text(s.firstName),
      key4: text(s.lastName),
      key5: text(s.createdAt),
      key6: text(s.id),
      sortTime: new Date(s.updatedAt || s.createdAt || 0).getTime(),
    };
  });

  // Sort using precomputed keys
  studentsWithKeys.sort((a, b) => {
    // First sort by sortTime descending (newest first)
    let cmp = b.sortTime - a.sortTime;
    if (cmp !== 0) return cmp;

    // Then sort by classId
    cmp = collator.compare(a.key1, b.key1);
    if (cmp !== 0) return cmp;

    // Then sort by admissionNo/studentId
    cmp = collator.compare(a.key2, b.key2);
    if (cmp !== 0) return cmp;

    // Then sort by first name
    cmp = collator.compare(a.key3, b.key3);
    if (cmp !== 0) return cmp;

    // Then sort by last name
    cmp = collator.compare(a.key4, b.key4);
    if (cmp !== 0) return cmp;

    // Then sort by createdAt
    cmp = collator.compare(a.key5, b.key5);
    if (cmp !== 0) return cmp;

    // Finally sort by id
    return collator.compare(a.key6, b.key6);
  });

  // Extract the original students
  return studentsWithKeys.map(item => item.student);
}
