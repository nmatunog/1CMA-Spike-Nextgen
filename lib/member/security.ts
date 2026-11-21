import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function opaqueToken() { return randomBytes(32).toString('hex'); }
export function tokenHash(value: string, secret: string) { return createHmac('sha256', secret).update(`member:${value}`).digest('hex'); }
export function passwordDigest(password: string) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function passwordMatches(password: string, salt: unknown, hash: unknown) {
  const good = typeof salt === 'string' && /^[a-f0-9]{32}$/.test(salt) && typeof hash === 'string' && /^[a-f0-9]{128}$/.test(hash);
  const actual = scryptSync(password, good ? salt as string : '0'.repeat(32), 64);
  return timingSafeEqual(actual, Buffer.from(good ? hash as string : '0'.repeat(128), 'hex')) && good;
}
