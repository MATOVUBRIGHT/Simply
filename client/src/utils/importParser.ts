export type ParsedImportFile = {
  headers: string[];
  data: string[][];
};

export function getImportCellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) ? String(value) : String(value).trim();
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replace(/^\uFEFF/, '').trim();
}

function normalizeHeaders(rawHeaders: unknown[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((header, index) => {
    const base = getImportCellText(header) || `Column ${index + 1}`;
    const key = base.trim().toLowerCase();
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    return count === 0 ? base : `${base} ${count + 1}`;
  });
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(getImportCellText(cell));
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(getImportCellText(cell));
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(getImportCellText(cell));
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function rowsToParsed(rows: unknown[][]): ParsedImportFile {
  const nonEmptyRows = rows.filter(row => row.some(cell => getImportCellText(cell)));
  if (nonEmptyRows.length < 2) {
    throw new Error('Import file must have headers and at least one data row');
  }
  const headers = normalizeHeaders(nonEmptyRows[0]);
  const data = nonEmptyRows.slice(1).map(row => headers.map((_, index) => getImportCellText(row[index])));
  return { headers, data };
}

async function parseWorkbook(file: File): Promise<ParsedImportFile> {
  const { read, utils } = await import('xlsx');
  const workbook = read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    const nonEmptyRows = rows.filter(row => row.some(cell => getImportCellText(cell)));
    if (nonEmptyRows.length >= 2) return rowsToParsed(nonEmptyRows);
  }
  throw new Error('Excel file must have headers and at least one data row');
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  if (/\.(xlsx|xls)$/i.test(file.name)) return parseWorkbook(file);
  if (!/\.(csv|txt)$/i.test(file.name)) {
    throw new Error('Use a CSV, XLS, or XLSX import file');
  }
  return rowsToParsed(parseCSV(await file.text()));
}
