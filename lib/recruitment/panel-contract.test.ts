import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { WRITABLE_STAGES, STOP_STAGE } from './stages';

describe('command panel contract', () => {
  const src = readFileSync('app/recruitment/command/panel.tsx', 'utf8');
  it('does not offer opt_out as a writable stage option', () => {
    expect(src).toContain('WRITABLE_STAGES');
    expect(src).toContain("name=\"due\"");
    expect(src).toContain('toManilaDateTimeLocal(row.due_at)');
    expect(WRITABLE_STAGES).not.toContain(STOP_STAGE);
    expect(src).toMatch(/STOP \/ suppress all channels/);
  });
  it('keeps email and phone out of the aggregate queue markup', () => {
    expect(src).toMatch(/Names only in this list/);
    expect(src).not.toMatch(/\{c\.email\}/);
    expect(src).not.toMatch(/\{c\.phone\}/);
  });
  it('keeps Follow-up saved visible after the queue reload', () => {
    expect(src).toMatch(/await load\(\{ keepMessage: true \}\)/);
    expect(src).toMatch(/setMessage\('Follow-up saved'\)/);
  });
});
