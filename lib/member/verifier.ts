import { verify } from '@/lib/vendor/versa-code/service.js';
import { digestCode } from '@/lib/vendor/versa-code/digest.js';
import { createMemoryAdmin } from '@/lib/vendor/versa-code/test/memoryAdmin.js';

export type VerifiedMember = { userId: string; email: string; emailConfirmed: true };
export interface CodeVerifier { check(code: string, identity: VerifiedMember): Promise<boolean> }
/** Uses the pinned upstream verifier, never redeem(), with a grantor that cannot grant. */
export function readOnlyVerifier(admin: unknown, secret: string): CodeVerifier {
  return { async check(code, identity) {
    const result = await verify(code, identity, '', '', {
      env: { VERSA_CSV_CODE_GATE: 'true', VERSA_CODE_HMAC_SECRET: secret },
      admin,
      inferFromPlanSlug: true,
      grantor: { hasExisting: async () => false, grant: async () => { throw new Error('handoff_cannot_grant'); } },
      logger: { info() {}, warn() {}, error() {} },
    });
    // A handoff needs an available inventory row, not a free-entry or prior-access bypass.
    return result.ok === true && result.reason === 'valid';
  } };
}
export async function syntheticVerifier(secret: string) {
  const rows = [];
  for (let index = 1; index <= 40; index++) {
    for (const prefix of ['FREE', 'PRO']) {
      const code = `${prefix}-SYN${String(index).padStart(5, '0')}`;
      rows.push({ id: `${prefix}-${index}`, code_digest: await digestCode(secret, code),
        plan_slug: prefix === 'FREE' ? 'free' : 'pro', plan: prefix === 'FREE' ? 'CRM Free' : 'CRM Pro',
        level: prefix === 'FREE' ? 'L1' : 'L2', offering_id: prefix === 'FREE' ? 'financial-literacy' : 'financial-entrepreneurship',
        program_route: 'spike-interns', status: index === 3 ? 'redeemed' : index === 4 ? 'revoked' : 'available',
        verified_email: index === 5 ? 'different-owner@example.test' : null,
        expires_at: index === 2 ? '2000-01-01T00:00:00Z' : null,
      });
    }
  }
  const admin = createMemoryAdmin({ versa_code_inventory: rows });
  return { verifier: readOnlyVerifier(admin, secret), admin };
}
