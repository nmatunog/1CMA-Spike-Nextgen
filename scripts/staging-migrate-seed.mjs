#!/usr/bin/env node
// Off-platform only. Never import or run this from the Worker.
// Applies migrations/0001–0011 against DATABASE_URL, then synthetic seed.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { seedFutureFep, seedSyntheticQueue } from '../lib/recruitment/demo-seed.mjs';

export const STAGING_CONFIRM_VALUE = 'nextgen-staging';
export const STAGING_MIGRATION_FIRST = 1;
export const STAGING_MIGRATION_LAST = 11;

const CANDIDATES_BOOTSTRAP = `CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  score integer NOT NULL,
  created_at timestamptz DEFAULT now()
)`;

/** @param {{ STAGING_CONFIRM?: string }} [env] */
export function assertStagingConfirm(env = process.env) {
  if (env.STAGING_CONFIRM !== STAGING_CONFIRM_VALUE) {
    throw new Error('refused: set STAGING_CONFIRM=nextgen-staging to run staging migrate/seed');
  }
}

/**
 * DATABASE_URL host (and optional /dbname) must match STAGING_DATABASE_HOST.
 * Comma-separated allowlist. Examples: `127.0.0.1`, `127.0.0.1/nextgen_staging`.
 * @param {{ STAGING_DATABASE_HOST?: string, DATABASE_URL?: string }} [env]
 */
export function assertStagingDatabase(env = process.env) {
  const allow = String(env.STAGING_DATABASE_HOST || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allow.length) {
    throw new Error('refused: set STAGING_DATABASE_HOST to the allowed host or host/dbname');
  }
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('refused: DATABASE_URL is not a valid URL');
  }
  const host = parsed.hostname;
  const dbname = decodeURIComponent(parsed.pathname.replace(/^\//, '')).split('/')[0] || '';
  const hostDb = dbname ? `${host}/${dbname}` : host;
  const ok = allow.some((entry) => entry === host || entry === hostDb);
  if (!ok) {
    throw new Error('refused: DATABASE_URL host does not match STAGING_DATABASE_HOST');
  }
}

export function filterStagingMigrations(names) {
  return names.filter((name) => {
    const match = name.match(/^(\d+)/);
    if (!match) return false;
    const n = Number(match[1]);
    return n >= STAGING_MIGRATION_FIRST && n <= STAGING_MIGRATION_LAST;
  }).sort();
}

export async function listStagingMigrationFiles(dir = 'migrations') {
  return filterStagingMigrations((await readdir(dir)).filter((name) => /^\d+.*\.sql$/.test(name)));
}

export async function applyStagingMigrationsAndSeed({ exec, query, leaderEmail = 'leader@example.test', dir = 'migrations' }) {
  await exec(CANDIDATES_BOOTSTRAP);
  for (const name of await listStagingMigrationFiles(dir)) {
    await exec(await readFile(`${dir}/${name}`, 'utf8'));
  }
  await seedFutureFep(exec);
  await seedSyntheticQueue(query, leaderEmail);
}

export async function runStagingMigrateSeed(env = process.env) {
  assertStagingConfirm(env);
  assertStagingDatabase(env);
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await applyStagingMigrationsAndSeed({
      exec: (text) => sql.unsafe(text),
      query: (text, params) => sql.unsafe(text, params ?? []),
      leaderEmail: env.STAGING_LEADER_EMAIL || 'leader@example.test',
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runStagingMigrateSeed().then(() => {
    console.info('staging migrate/seed complete (synthetic only)');
  }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
