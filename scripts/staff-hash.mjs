#!/usr/bin/env node
// Generates salted scrypt hashes for RECRUITMENT_STAFF_ACCOUNTS / RECRUITMENT_STAFF_ROLES.
// Plaintext passwords are written only to a gitignored file (work/staff-plaintext.json).
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const STAFF_PLAINTEXT_PATH = 'work/staff-plaintext.json';

export function hashStaffPassword(password, salt = randomBytes(16).toString('hex')) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
    throw new Error('password must be 8–256 characters');
  }
  if (!/^[a-f0-9]{32}$/.test(salt)) throw new Error('salt must be 32 hex characters');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function parseStaffSpecs(args) {
  if (!args.length) {
    return [
      { email: 'admin@example.test', role: 'admin' },
      { email: 'leader@example.test', role: 'leader' },
    ];
  }
  return args.map((spec) => {
    const [email, role = 'leader'] = spec.split(':');
    if (!email || !email.includes('@')) throw new Error(`invalid staff spec: ${spec}`);
    return { email: email.trim().toLowerCase(), role: role.trim().toLowerCase() };
  });
}

export function buildStaffEnv(accounts) {
  const hashes = {};
  const roles = {};
  const plaintext = {};
  for (const account of accounts) {
    const email = account.email.trim().toLowerCase();
    const password = account.password || randomBytes(24).toString('hex');
    hashes[email] = hashStaffPassword(password);
    roles[email] = account.role;
    plaintext[email] = password;
  }
  return {
    RECRUITMENT_STAFF_ACCOUNTS: hashes,
    RECRUITMENT_STAFF_ROLES: roles,
    plaintext,
  };
}

export async function writeStaffPlaintext(plaintext, path = STAFF_PLAINTEXT_PATH) {
  await mkdir('work', { recursive: true });
  await writeFile(path, `${JSON.stringify(plaintext, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function formatStaffEnvExport(payload) {
  return [
    `RECRUITMENT_STAFF_ACCOUNTS='${JSON.stringify(payload.RECRUITMENT_STAFF_ACCOUNTS)}'`,
    `RECRUITMENT_STAFF_ROLES='${JSON.stringify(payload.RECRUITMENT_STAFF_ROLES)}'`,
  ].join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    const payload = buildStaffEnv(parseStaffSpecs(process.argv.slice(2)));
    const path = await writeStaffPlaintext(payload.plaintext);
    process.stdout.write(`${formatStaffEnvExport(payload)}\n`);
    process.stderr.write(`plaintext written to ${path} (gitignored); do not commit it\n`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
