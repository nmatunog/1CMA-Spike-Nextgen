import { requireConsent } from './access.mjs';
import { GIA_TOOLS } from './engine.mjs';

export { GIA_TOOLS };
export const WORKFLOW_ACTIONS = Object.freeze(['consent', ...GIA_TOOLS]);
export const HANDOFF_REASONS = Object.freeze([
  'leader_requested', 'documents', 'restricted', 'unapproved_or_unknown',
  'fep_change', 'boundary_codes', 'boundary_payment', 'boundary_entitlements',
  'route_ra_spike', 'route_spike_interns',
]);

function transcriptFor(action, input) {
  if (action === 'get_my_status' || input?.otp) return null;
  if (input?.file || input?.upload || input?.document || input?.attachments) return null;
  if (typeof input?.text === 'string') return input.text.slice(0, 1000);
  return null;
}

async function dispatch(tx, action, input) {
  let candidate = await tx.findCandidate();
  if (action === 'opt_out') {
    // INTEGRATION SEAM (C1): Global STOP/suppression is expected in
    // lib/recruitment/suppression. GIA must keep calling this existing
    // repository path (optOut / suppressIdentity) until that module is wired.
    // Do not import app/recruitment/* or app/api/recruitment/* from GIA.
    // When C1 exposes applySuppression({ candidateId, identity, source: 'gia' }),
    // replace only the two calls below and keep writing gia.turn audit events.
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
  if (action === 'list_fep_sessions') {
    return { ok: true, sessions: await tx.listSessions() };
  }
  requireConsent(candidate);
  if (action === 'request_leader') {
    const reason = HANDOFF_REASONS.includes(input.reason) ? input.reason : 'leader_requested';
    return { ok: true, reason, handoff: await tx.handoff(candidate, reason) };
  }
  if (action === 'book_fep') {
    if (typeof input.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.sessionId)) throw new Error('invalid_session');
    const existing = await tx.findOpenBooking(candidate);
    if (existing && existing.session_id !== input.sessionId) {
      return {
        ok: true,
        reason: 'fep_change',
        handoff: await tx.handoff(candidate, 'fep_change'),
        message: 'FEP changes are handled by a 1CMA leader. I cannot cancel or move a booking here.',
      };
    }
    return { ok: true, booking: await tx.book(candidate, input.sessionId) };
  }
  if (action === 'get_my_status') {
    if (typeof input.otp === 'string' && input.otp) {
      if (!await tx.verifyOtp(input.otp)) throw new Error('verification_required');
    } else if (!await tx.otpVerified()) {
      const challenge = await tx.issueOtp();
      return {
        ok: false,
        error: 'verification_required',
        challenge: {
          id: challenge.challengeId,
          expiresAt: challenge.expiresAt,
          ...(challenge.devCode ? { devCode: challenge.devCode } : {}),
        },
      };
    }
    return { ok: true, status: await tx.ownStatus(candidate) };
  }
  throw new Error('unknown_action');
}

// Repository.run serializes mutations and commits records and events atomically.
export async function perform(repo, identity, action, input = {}) {
  if (action === 'cancel_fep' || (action && !WORKFLOW_ACTIONS.includes(action))) throw new Error('unknown_action');
  try {
    return await repo.run(identity, async tx => {
      const result = await dispatch(tx, action, input);
      await tx.recordTurn({
        action,
        intent: action,
        reason: input.reason || result.reason || null,
        citation: result.citation || null,
        outcome: result.ok === false ? String(result.error || 'error') : 'ok',
      }, transcriptFor(action, input));
      return result;
    });
  } catch (err) {
    try {
      await repo.run(identity, async tx => {
        await tx.recordTurn({
          action,
          intent: action,
          reason: input.reason || null,
          citation: null,
          outcome: err instanceof Error ? err.message : 'error',
        }, transcriptFor(action, input));
      });
    } catch { /* original error is authoritative */ }
    throw err;
  }
}
