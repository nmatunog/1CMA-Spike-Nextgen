import { requireConsent } from './access.mjs';
// Repository.run serializes mutations and commits records and events atomically.
export async function perform(repo, identity, action, input = {}) {
  return repo.run(identity, async tx => {
    let candidate = await tx.findCandidate();
    if (action === 'opt_out') {
      if (candidate) await tx.optOut(candidate);
      else await tx.suppressIdentity();
      return { ok: true, message: 'You are opted out. No further follow-up will be sent.' };
    }
    if (await tx.suppressed() || candidate?.stage === 'opt_out') throw new Error('opted_out');
    if (action === 'consent') {
      if (input.agree !== true || input.notice !== 'gia-pilot-2026-11-04') throw new Error('consent_required');
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || typeof input.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) throw new Error('invalid_contact');
      // Identity is a random server-issued session. Never merge unverified contacts.
      candidate = candidate || await tx.createCandidate({ name: input.name.trim(), email: input.email.trim() });
      await tx.consent(candidate, input.notice);
      return { ok: true };
    }
    requireConsent(candidate);
    if (action === 'request_leader') {
      const reason = ['leader_requested', 'documents', 'restricted', 'unapproved_or_unknown'].includes(input.reason) ? input.reason : 'leader_requested';
      return { ok: true, handoff: await tx.handoff(candidate, reason) };
    }
    if (action === 'book_fep') {
      if (typeof input.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.sessionId)) throw new Error('invalid_session');
      return { ok: true, booking: await tx.book(candidate, input.sessionId) };
    }
    // A web session or demo login is never OTP verification.
    if (action === 'get_my_status') throw new Error('verification_required');
    throw new Error('unknown_action');
  });
}
