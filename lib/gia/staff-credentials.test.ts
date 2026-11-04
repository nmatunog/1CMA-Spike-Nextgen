import { it, expect } from 'vitest';
import { scryptSync } from 'node:crypto';
import { verifyStaff } from './staff-credentials.mjs';
const salt='0'.repeat(32);
const accounts=JSON.stringify({'leader@example.test':{salt,hash:scryptSync('synthetic-only-password',salt,64).toString('hex')}});
it('authenticates an individual staff identity with a salted hash', () => { expect(verifyStaff('Leader@example.test','synthetic-only-password',accounts)?.id).toBe('staff:leader@example.test'); });
it('rejects wrong passwords and unknown staff accounts', () => { expect(verifyStaff('leader@example.test','wrong',accounts)).toBeNull();expect(verifyStaff('other@example.test','synthetic-only-password',accounts)).toBeNull(); });
it('fails closed for malformed configuration or credentials', () => { expect(verifyStaff('leader@example.test','synthetic-only-password','bad')).toBeNull();expect(verifyStaff(undefined,undefined,accounts)).toBeNull(); });
