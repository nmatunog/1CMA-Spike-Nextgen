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
    expect(src).toMatch(/consent=\{h\.consented \? 'true' : 'false'\}/);
  });
  it('keeps Follow-up saved visible after the queue reload', () => {
    expect(src).toMatch(/await load\(\{ keepMessage: true \}\)/);
    expect(src).toMatch(/setMessage\('Follow-up saved'\)/);
  });
  it('documents that CSV consent is never inferred and snapshots are current', () => {
    expect(src).toMatch(/Consent is never inferred and is not required to capture/);
    expect(src).toMatch(/cannot be messaged/);
    expect(src).toMatch(/Unassigned \(current\)/);
    expect(src).toMatch(/ignore that window/);
    expect(src).toMatch(/Auto-merge only on a verified email\/mobile/);
  });
  it('records evaluation as a suggestion that does not change stage or grant L1/L2', () => {
    expect(src).toMatch(/Does not change stage or grant L1\/L2 access/);
    expect(src).toMatch(/Record evaluation/);
    expect(src).toMatch(/Follow-up outcome/);
    expect(src).toMatch(/Awaiting evaluation \(current\)/);
  });
});
