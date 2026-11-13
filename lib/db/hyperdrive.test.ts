import { afterEach, describe, expect, it, vi } from 'vitest';
import { HYPERDRIVE_POSTGRES_OPTIONS, NODE_POSTGRES_OPTIONS, postgresOptions } from './postgres-options';
import { workersHyperdriveConnectionString } from './hyperdrive';

const SLOT = Symbol.for('__cloudflare-context__');

afterEach(() => {
  delete (globalThis as unknown as Record<symbol, unknown>)[SLOT];
});

describe('postgres options', () => {
  it('keeps prepare: false on the local DATABASE_URL path', () => {
    expect(NODE_POSTGRES_OPTIONS).toEqual({ max: 1, prepare: false });
    expect(NODE_POSTGRES_OPTIONS.prepare).toBe(false);
    expect(postgresOptions('node')).toEqual(NODE_POSTGRES_OPTIONS);
  });

  it('does not set prepare: false on Hyperdrive', () => {
    expect(HYPERDRIVE_POSTGRES_OPTIONS).toEqual({ max: 5 });
    expect(HYPERDRIVE_POSTGRES_OPTIONS).not.toHaveProperty('prepare');
    expect(Object.prototype.hasOwnProperty.call(postgresOptions('hyperdrive'), 'prepare')).toBe(false);
  });
});

describe('workersHyperdriveConnectionString', () => {
  it('is null in Node so tests keep DATABASE_URL / PGlite', () => {
    expect(workersHyperdriveConnectionString()).toBeNull();
  });

  it('reads env.HYPERDRIVE.connectionString from the OpenNext request context', () => {
    (globalThis as unknown as Record<symbol, unknown>)[SLOT] = {
      env: { HYPERDRIVE: { connectionString: 'postgres://hyperdrive-placeholder/db' } },
    };
    expect(workersHyperdriveConnectionString()).toBe('postgres://hyperdrive-placeholder/db');
  });
});

describe('sql() Hyperdrive vs node', () => {
  it('creates a request-scoped client from Hyperdrive without prepare: false', async () => {
    const postgres = vi.fn(() => ({ begin: vi.fn() }));
    vi.doMock('postgres', () => ({ default: postgres }));
    vi.resetModules();
    (globalThis as unknown as Record<symbol, unknown>)[SLOT] = {
      env: { HYPERDRIVE: { connectionString: 'postgres://hd/db' } },
    };
    const { sql } = await import('@/lib/gia/repository');
    sql();
    sql();
    expect(postgres).toHaveBeenCalledTimes(2);
    expect(postgres).toHaveBeenNthCalledWith(1, 'postgres://hd/db', { max: 5 });
    expect(postgres.mock.calls[0]?.[1]).not.toHaveProperty('prepare');
  });
});
