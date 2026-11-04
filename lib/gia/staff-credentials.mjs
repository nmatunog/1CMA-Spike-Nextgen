import { scryptSync, timingSafeEqual } from 'node:crypto';
// Individual staff accounts use salted scrypt hashes. Roles are assigned separately.
export function verifyStaff(email, password, accounts) {
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 256 || email.length > 254 || !accounts) return null;
  try {
    const normalized = email.trim().toLowerCase();
    const account = JSON.parse(accounts)[normalized];
    if (!account || !/^[a-f0-9]{32}$/.test(account.salt) || !/^[a-f0-9]{128}$/.test(account.hash)) return null;
    const actual = scryptSync(password, account.salt, 64);
    if (!timingSafeEqual(actual, Buffer.from(account.hash,'hex'))) return null;
    return { id: `staff:${normalized}`, email: normalized, name: '1CMA Staff' };
  } catch { return null; }
}
