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

describe('sql() / getDb() Hyperdrive vs node', () => {
  it('memoizes one postgres.js client per OpenNext request and registers waitUntil end', async () => {
    const ended: Array<{ timeout?: number }> = [];
    const postgres = vi.fn(() => ({
      begin: vi.fn(),
      options: { parsers: {}, serializers: {} },
      end: vi.fn((opts?: { timeout?: number }) => {
        ended.push(opts || {});
        return Promise.resolve();
      }),
    }));
    vi.doMock('postgres', () => ({ default: postgres }));
    vi.resetModules();
    const waitUntil = vi.fn();
    const store = {
      env: { HYPERDRIVE: { connectionString: 'postgres://hd/db' } },
      ctx: { waitUntil },
    };
    (globalThis as unknown as Record<symbol, unknown>)[SLOT] = store;
    const { sql } = await import('@/lib/gia/repository');
    const { workersPostgres } = await import('@/lib/db/hyperdrive');
    const { getDb } = await import('@/lib/db/client');
    const first = sql();
    const second = sql();
    getDb();
    expect(first).toBe(second);
    expect(workersPostgres()).toBe(first);
    expect(postgres).toHaveBeenCalledTimes(1);
    expect(postgres).toHaveBeenNthCalledWith(1, 'postgres://hd/db', { max: 5 });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(ended).toEqual([{ timeout: 5 }]);
  });

  it('uses a different client for a different request context', async () => {
    const postgres = vi.fn(() => ({ begin: vi.fn(), end: vi.fn(() => Promise.resolve()) }));
    vi.doMock('postgres', () => ({ default: postgres }));
    vi.resetModules();
    const storeA = {
      env: { HYPERDRIVE: { connectionString: 'postgres://hd/a' } },
      ctx: { waitUntil: vi.fn() },
    };
    const storeB = {
      env: { HYPERDRIVE: { connectionString: 'postgres://hd/b' } },
      ctx: { waitUntil: vi.fn() },
    };
    (globalThis as unknown as Record<symbol, unknown>)[SLOT] = storeA;
    const { sql } = await import('@/lib/gia/repository');
    sql();
    (globalThis as unknown as Record<symbol, unknown>)[SLOT] = storeB;
    sql();
    expect(postgres).toHaveBeenCalledTimes(2);
  });

  it('keeps the Node DATABASE_URL singleton when OpenNext context is absent', async () => {
    const postgres = vi.fn(() => ({ begin: vi.fn() }));
    vi.doMock('postgres', () => ({ default: postgres }));
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://synthetic-node';
    const { sql } = await import('@/lib/gia/repository');
    sql();
    sql();
    expect(postgres).toHaveBeenCalledTimes(1);
    expect(postgres).toHaveBeenNthCalledWith(1, 'postgres://synthetic-node', { max: 1, prepare: false });
  });
});
