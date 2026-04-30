const ID_FORMAT_KEY = 'schofy_id_format';

export interface IdFormat {
  pattern: string;
  prefix: string;
  useNameInitials: boolean;
  useRandomNumbers: boolean;
  randomNumberLength: number;
  useYear: boolean;
  useSequential: boolean;
  separator: string;
  customExample: string;
}

const defaultFormats: Record<string, IdFormat> = {
  initials_number: {
    pattern: 'INI###',
    prefix: '',
    useNameInitials: true,
    useRandomNumbers: false,
    randomNumberLength: 3,
    useYear: false,
    useSequential: true,
    separator: '',
    customExample: 'mb114',
  },
  sequential: {
    pattern: 'ADM/YYYY/####',
    prefix: 'ADM',
    useNameInitials: false,
    useRandomNumbers: false,
    randomNumberLength: 4,
    useYear: true,
    useSequential: true,
    separator: '/',
    customExample: 'ADM/2026/0001',
  },
  initials_random: {
    pattern: 'INI####',
    prefix: '',
    useNameInitials: true,
    useRandomNumbers: true,
    randomNumberLength: 4,
    useYear: false,
    useSequential: false,
    separator: '',
    customExample: 'mb1047',
  },
  mixed: {
    pattern: 'PRE-INI-YYYY-####',
    prefix: 'SCH',
    useNameInitials: true,
    useRandomNumbers: false,
    randomNumberLength: 4,
    useYear: true,
    useSequential: true,
    separator: '-',
    customExample: 'SCH-MB-2026-0001',
  },
};

export function getSavedIdFormat(): IdFormat {
  try {
    const saved = localStorage.getItem(ID_FORMAT_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return defaultFormats.initials_number;
}

export function saveIdFormat(format: IdFormat): void {
  localStorage.setItem(ID_FORMAT_KEY, JSON.stringify(format));
}

export function resetIdFormat(): void {
  localStorage.removeItem(ID_FORMAT_KEY);
}

export function getPresetFormats(): Record<string, IdFormat> {
  return defaultFormats;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getNameInitials(firstName: string, lastName: string): string {
  const first = (firstName?.trim()?.[0] || '').toLowerCase();
  const last = (lastName?.trim()?.[0] || '').toLowerCase();
  return first + last;
}

function generateRandomNumber(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) result += Math.floor(Math.random() * 10);
  return result;
}

function getNextSequenceNumber(prefix: string, existingValues: string[], padLength = 3): string {
  // Find highest number among existing IDs that start with the same prefix (case-insensitive)
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^${escaped}(\\d+)`, 'i');
  let highest = 0;
  let found = false;
  for (const v of existingValues) {
    const m = v.match(matcher);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) { highest = Math.max(highest, n); found = true; }
    }
  }
  // If no existing IDs found with this prefix, start from a random number to avoid collisions
  if (!found) {
    return String(Math.floor(100 + Math.random() * 900));
  }
  return String(highest + 1).padStart(padLength, '0');
}

// ── main generator ────────────────────────────────────────────────────────────

export function generateStudentId(
  firstName: string,
  lastName: string,
  existingValues: string[] = []
): string {
  return _generateId(firstName, lastName, existingValues);
}

export function generateStaffId(
  firstName: string,
  lastName: string,
  existingValues: string[] = []
): string {
  return _generateId(firstName, lastName, existingValues);
}

function _generateId(
  firstName: string,
  lastName: string,
  existingValues: string[] = []
): string {
  const format = getSavedIdFormat();
  const year = new Date().getFullYear();
  const initials = format.useNameInitials ? getNameInitials(firstName, lastName) : '';

  let result = format.pattern;

  // Replace year tokens
  result = result.replace(/YYYY/g, String(year));
  result = result.replace(/YY/g, String(year).slice(-2));

  // Replace initials token
  if (format.useNameInitials) {
    result = result.replace(/INI/g, initials);
  }

  // Replace number tokens
  if (format.useRandomNumbers) {
    result = result.replace(/\*+/g, generateRandomNumber(format.randomNumberLength));
  }

  if (format.useSequential) {
    // Build the prefix up to the # signs to find the right sequence
    const prefixPart = result.replace(/#+.*$/, '');
    const padLen = (result.match(/#+/)?.[0]?.length) || 3;
    const seqNum = getNextSequenceNumber(prefixPart, existingValues, padLen);
    result = result.replace(/#+/, seqNum);
  }

  // Clean up any remaining tokens with random numbers
  result = result.replace(/#+/g, generateRandomNumber(3)).replace(/\*+/g, generateRandomNumber(4));

  // Ensure uniqueness
  const existing = new Set(existingValues.map(v => v.toLowerCase()));
  let final = result;
  let attempts = 0;
  while (existing.has(final.toLowerCase()) && attempts < 50) {
    const suffix = generateRandomNumber(2);
    final = result.replace(/\d+$/, m => String(parseInt(m) + parseInt(suffix) + 1).padStart(m.length, '0'));
    attempts++;
  }

  return final;
}

export function generateExampleId(format?: Partial<IdFormat>): string {
  const f = { ...getSavedIdFormat(), ...format };
  let result = f.pattern || '';
  result = result.replace(/YYYY/g, '2026');
  result = result.replace(/YY/g, '26');
  result = result.replace(/INI/g, 'mb');
  result = result.replace(/\*+/g, generateRandomNumber(f.randomNumberLength || 4));
  result = result.replace(/#+/, '114');
  return result;
}

export function parsePattern(pattern: string): IdFormat {
  const useYear = /YYYY|YY/.test(pattern);
  const useSequential = /#+/.test(pattern);
  const useRandomNumbers = /\*+/.test(pattern);
  const useNameInitials = /INI/.test(pattern);
  const separators = pattern.match(/[\/\-_]/g) || [];
  const separator = separators[0] || '';
  const prefix = pattern.split(/INI|YYYY|YY|#+|\*+|[\/\-_]/)[0] || '';
  const padLen = (pattern.match(/#+/)?.[0]?.length) || 3;

  return {
    pattern,
    prefix,
    useNameInitials,
    useRandomNumbers,
    randomNumberLength: padLen,
    useYear,
    useSequential,
    separator,
    customExample: generateExampleId({ pattern, useNameInitials, useRandomNumbers, useYear, useSequential, randomNumberLength: padLen, prefix, separator }),
  };
}

export function extractFormatFromId(id: string): IdFormat | null {
  if (!id || id.length < 3) return null;
  const sep = id.match(/[\/\-_]/)?.[0] || '';
  const parts = sep ? id.split(sep) : [id];
  const patternParts = parts.map(p => {
    if (/^\d{4}$/.test(p)) return 'YYYY';
    if (/^\d{2}$/.test(p)) return 'YY';
    if (/^\d+$/.test(p)) return '#'.repeat(p.length);
    if (/^[a-z]{2}$/i.test(p)) return 'INI';
    return p.toUpperCase();
  });
  const pattern = patternParts.join(sep);
  return parsePattern(pattern);
}
