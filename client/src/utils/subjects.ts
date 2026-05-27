export type SubjectCode = string | number;

export function normalizeSubjectCode(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function getSubjectCode(subject: any) {
  return normalizeSubjectCode(subject?.code ?? subject?.subjectCode ?? subject?.subject_code);
}

export function getSubjectDisplayCode(subject: any) {
  const code = getSubjectCode(subject);
  if (code) return code;

  const name = normalizeSubjectCode(subject?.name ?? subject?.subjectName ?? subject?.subject_name);
  if (name) {
    const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return words.length === 1 ? words[0].slice(0, 4) : words.map(word => word[0]).join('').slice(0, 6);
  }

  return normalizeSubjectCode(subject?.id).slice(0, 8).toUpperCase();
}
