import { describe, it, expect } from 'vitest';
import { manilaDayBounds, parseManilaDateTimeLocal, toManilaDateTimeLocal, MANILA_OFFSET } from './time';
import { WRITABLE_STAGES, STOP_STAGE } from './stages';

describe('Manila time helpers', () => {
  it('treats date range bounds as inclusive Asia/Manila calendar days', () => {
    const bounds = manilaDayBounds('2026-11-11', '2026-11-11');
    expect(bounds).toEqual({
      from: new Date(`2026-11-11T00:00:00${MANILA_OFFSET}`).toISOString(),
      toExclusive: new Date(`2026-11-12T00:00:00${MANILA_OFFSET}`).toISOString(),
    });
  });
  it('rejects inverted ranges', () => {
    expect(manilaDayBounds('2026-11-12', '2026-11-11')).toBeNull();
  });
  it('round-trips datetime-local as Manila, not the host timezone', () => {
    const iso = parseManilaDateTimeLocal('2026-11-11T09:30');
    expect(iso).toBe(new Date('2026-11-11T01:30:00.000Z').toISOString());
    expect(toManilaDateTimeLocal(iso)).toBe('2026-11-11T09:30');
  });
});

describe('writable stages', () => {
  it('does not include opt_out — STOP is a dedicated path', () => {
    expect(WRITABLE_STAGES).not.toContain(STOP_STAGE);
  });
});
