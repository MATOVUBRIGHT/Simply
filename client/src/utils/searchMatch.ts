export function normalizeSearchValue(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function matchesTextSearch(values: unknown[] | unknown, query: string): boolean {
  const q = normalizeSearchValue(query);
  if (!q) return true;

  const haystack = normalizeSearchValue(Array.isArray(values) ? values.filter(Boolean).join(' ') : values);
  if (!haystack) return false;
  if (haystack.includes(q)) return true;

  return q.split(' ').filter(Boolean).every(token => haystack.includes(token));
}
