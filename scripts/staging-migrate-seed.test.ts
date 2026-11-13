import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  STAGING_CONFIRM_VALUE,
  applyStagingMigrationsAndSeed,
  assertStagingConfirm,
  filterStagingMigrations,
  listStagingMigrationFiles,
} from './staging-migrate-seed.mjs';

describe('staging migrate/seed gate', () => {
  it('refuses unless STAGING_CONFIRM=nextgen-staging', () => {
    expect(() => assertStagingConfirm({})).toThrow(/STAGING_CONFIRM=nextgen-staging/);
    expect(() => assertStagingConfirm({ STAGING_CONFIRM: 'yes' })).toThrow(/refused/);
    expect(() => assertStagingConfirm({ STAGING_CONFIRM: STAGING_CONFIRM_VALUE })).not.toThrow();
  });

  it('exits non-zero when the CLI gate is missing', () => {
    const result = spawnSync(process.execPath, ['scripts/staging-migrate-seed.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, STAGING_CONFIRM: '', DATABASE_URL: 'postgres://synthetic' },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/STAGING_CONFIRM=nextgen-staging/);
  });

  it('applies 0001–0011 in order', async () => {
    const names = await listStagingMigrationFiles();
    expect(names[0]).toMatch(/^0001/);
    expect(names[names.length - 1]).toMatch(/^0011/);
    expect(names).toHaveLength(11);
    expect(filterStagingMigrations(['0001_a.sql', '0012_skip.sql', '0011_z.sql'])).toEqual([
      '0001_a.sql',
      '0011_z.sql',
    ]);
  });

  it('seeds synthetic FEP and queue against PGlite', async () => {
    const db = new PGlite();
    try {
      await applyStagingMigrationsAndSeed({
        exec: (sql: string) => db.exec(sql),
        query: (sql: string, params?: unknown[]) => db.query(sql, params),
        leaderEmail: 'leader@example.test',
      });
      const sessions = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM fep_sessions');
      const candidates = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM candidates');
      expect(Number(sessions.rows[0]?.n)).toBeGreaterThan(0);
      expect(Number(candidates.rows[0]?.n)).toBe(3);
    } finally {
      await db.close();
    }
  });
});
