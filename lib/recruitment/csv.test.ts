import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { escapeSpreadsheetCell, looksLikeFormula, parseCsv, toCsv } from './csv';

describe('CSV helpers', () => {
  it('rejects secret/code columns before any row is read as identity', () => {
    expect(() => parseCsv('name,email,access_code\nA,a@example.test,RAWCODE99\n')).toThrow('forbidden_secret_column');
  });
  it('escapes formula injection for spreadsheet export', () => {
    const csv = toCsv(['name'], [['=CMD()'], ['+1+1'], ['@SUM(1)'], ['safe']]);
    expect(csv).toMatch(/"'=CMD\(\)"/);
    expect(csv).toMatch(/"'\+1\+1"/);
    expect(csv).toMatch(/"'@SUM\(1\)"/);
    expect(csv).toMatch(/\nsafe\n/);
    expect(escapeSpreadsheetCell('=1+1').startsWith('"\'=')).toBe(true);
  });
  it('treats leading whitespace before = + - @ as a formula', () => {
    expect(looksLikeFormula(' =CMD()')).toBe(true);
    expect(looksLikeFormula('\t+1+1')).toBe(true);
    expect(looksLikeFormula('  @SUM(1)')).toBe(true);
    expect(looksLikeFormula(' -1')).toBe(true);
    expect(looksLikeFormula(' safe')).toBe(false);
    const csv = toCsv(['name'], [[' =CMD()'], ['\t=HID()']]);
    expect(csv).toMatch(/"' =CMD\(\)"/);
    expect(csv).toMatch(/"'\t=HID\(\)"/);
  });
  it('parses the synthetic 10-prospect fixture', () => {
    const text = readFileSync('tests/gia/fixtures/cc02b-10-prospects.csv', 'utf8');
    const parsed = parseCsv(text);
    expect(parsed.rows).toHaveLength(10);
    expect(parsed.headers).toContain('versa_lead_ref');
    expect(parsed.headers).not.toContain('code');
  });
});
