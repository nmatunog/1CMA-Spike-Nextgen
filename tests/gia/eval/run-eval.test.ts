import { afterEach, expect, it, vi } from 'vitest';
import { seedSaturday } from './run-eval.mjs';

afterEach(() => vi.useRealTimers());
it.each(['2026-11-14T10:00:00Z', '2027-01-02T10:00:00Z'])(
  'seeds future booking sessions after the frozen knowledge date: %s', async now => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [] }));
    await seedSaturday({ query });
    expect(query).toHaveBeenCalledTimes(2);
    const saturday = new Date(String(query.mock.calls[0][1][1]));
    const later = new Date(String(query.mock.calls[1][1][1]));
    expect(saturday.getUTCDay()).toBe(6);
    expect(saturday.getTime()).toBeGreaterThan(Date.now());
    expect(later.getTime()).toBeGreaterThan(saturday.getTime());
  },
);
