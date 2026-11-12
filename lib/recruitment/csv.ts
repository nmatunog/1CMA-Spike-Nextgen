import { createHash } from 'node:crypto';
import { canonicalHeader, looksLikeSecretHeader, ALLOWED_IMPORT_HEADERS } from './contacts';

export const MAX_CSV_BYTES = 200_000;
export const MAX_CSV_ROWS = 500;

export function sha256Text(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

export function normalizeCsvText(text: string) {
  let value = text;
  if (value.charCodeAt(0) === 0xfeff) value = value.slice(1);
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** True when a cell could be interpreted as a spreadsheet formula, including leading whitespace. */
export function looksLikeFormula(value: string) {
  return /^\s*[=+\-@]/.test(value ?? '');
}

/** Prefix formula-like cells so spreadsheet apps treat them as text. */
export function escapeSpreadsheetCell(value: string) {
  const text = value ?? '';
  const formula = looksLikeFormula(text);
  const guarded = formula ? `'${text}` : text;
  if (formula || /[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv(headers: string[], rows: string[][]) {
  const lines = [headers.map(escapeSpreadsheetCell).join(',')];
  for (const row of rows) lines.push(row.map((cell) => escapeSpreadsheetCell(cell ?? '')).join(','));
  return `${lines.join('\n')}\n`;
}

export function parseCsv(text: string) {
  const normalized = normalizeCsvText(text);
  if (Buffer.byteLength(normalized, 'utf8') > MAX_CSV_BYTES) throw new Error('csv_too_large');
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (quoted) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (quoted) throw new Error('invalid_csv');
  if (cell.length || row.length) {
    row.push(cell);
    records.push(row);
  }
  while (records.length && records[records.length - 1].every((value) => value.trim() === '')) records.pop();
  if (!records.length) throw new Error('invalid_csv');
  const rawHeaders = records[0].map((h) => h.trim());
  if (rawHeaders.some(looksLikeSecretHeader)) throw new Error('forbidden_secret_column');
  const headers = rawHeaders.map(canonicalHeader);
  if (headers.some((h) => !h)) throw new Error('invalid_csv');
  const allowed = new Set<string>(ALLOWED_IMPORT_HEADERS);
  for (const header of headers) {
    if (looksLikeSecretHeader(header)) throw new Error('forbidden_secret_column');
    if (!allowed.has(header)) throw new Error('unknown_column');
  }
  if (!headers.includes('name')) throw new Error('missing_name_column');
  const rows = records.slice(1);
  if (rows.length > MAX_CSV_ROWS) throw new Error('csv_too_large');
  return { headers, rows, sha256: sha256Text(normalized) };
}

export function rowObject(headers: string[], cells: string[]) {
  const out: Record<string, string> = {};
  headers.forEach((header, i) => {
    out[header] = (cells[i] || '').trim();
  });
  return out;
}
