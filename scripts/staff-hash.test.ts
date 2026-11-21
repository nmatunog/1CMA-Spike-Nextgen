import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyStaff } from '../lib/gia/staff-credentials.mjs';
import {
  STAFF_PLAINTEXT_PATH,
  buildStaffEnv,
  formatStaffEnvExport,
  hashStaffPassword,
  parseStaffSpecs,
  writeStaffPlaintext,
} from './staff-hash.mjs';

describe('staff-hash helper', () => {
  it('emits salted scrypt hashes that verifyStaff accepts', () => {
    const { salt, hash } = hashStaffPassword('synthetic-only-password', '0'.repeat(32));
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
    expect(hash).toMatch(/^[a-f0-9]{128}$/);
    const accounts = JSON.stringify({ 'admin@example.test': { salt, hash } });
    expect(verifyStaff('admin@example.test', 'synthetic-only-password', accounts)?.id).toBe('staff:admin@example.test');
  });

  it('writes plaintext only to the gitignored work/ path', async () => {
    expect(STAFF_PLAINTEXT_PATH).toBe('work/staff-plaintext.json');
    const dir = await mkdtemp(join(tmpdir(), 'staff-hash-'));
    const path = join(dir, 'staff-plaintext.json');
    try {
      const payload = buildStaffEnv([
        { email: 'admin@example.test', role: 'admin', password: 'synthetic-admin-pass' },
      ]);
      await writeStaffPlaintext(payload.plaintext, path);
      const written = JSON.parse(await readFile(path, 'utf8'));
      expect(written['admin@example.test']).toBe('synthetic-admin-pass');
      const exported = formatStaffEnvExport(payload);
      expect(exported).toMatch(/RECRUITMENT_STAFF_ACCOUNTS=/);
      expect(exported).toMatch(/RECRUITMENT_STAFF_ROLES=/);
      expect(exported).not.toMatch(/synthetic-admin-pass/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('CLI prints hashes and not the generated password', () => {
    const result = spawnSync(process.execPath, ['scripts/staff-hash.mjs', 'admin@example.test:admin'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/RECRUITMENT_STAFF_ACCOUNTS=/);
    expect(result.stderr).toMatch(/work\/staff-plaintext\.json/);
    const spec = parseStaffSpecs(['admin@example.test:admin']);
    expect(spec[0]).toEqual({ email: 'admin@example.test', role: 'admin' });
  });
});
