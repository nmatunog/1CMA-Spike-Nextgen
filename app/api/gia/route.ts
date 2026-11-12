import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { knowledge, respond } from '@/lib/gia/engine.mjs';
import { perform, recordRejected, WORKFLOW_ACTIONS } from '@/lib/gia/workflow.mjs';
import { LEAST_PRIVILEGED_PROGRAM, resolveStoredProgram } from '@/lib/gia/programs.mjs';
import { emitGiaEngagement } from '@/lib/gia/engagement.mjs';
import { repository } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { discardedUploadResponse, looksLikeUploadPayload } from '@/lib/gia/uploads.mjs';
import { assertOtpDevNotProduction, hashClientKey } from '@/lib/gia/otp.mjs';
import { looksLikeContact, looksLikeSecretToken } from '@/lib/mvp01/engage';
export const runtime = 'nodejs';
function secret() {
  const s = process.env.GIA_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('session_not_configured');
  return s;
}
function sign(id: string) { return createHmac('sha256', secret()).update(id).digest('hex'); }
async function identity() {
  const jar = await cookies();
  const token = jar.get('gia_session')?.value || '';
  const [id, mac] = token.split('.');
  if (/^[a-f0-9]{64}$/.test(id || '') && /^[a-f0-9]{64}$/.test(mac || '') && timingSafeEqual(Buffer.from(mac), Buffer.from(sign(id)))) return id;
  const next = randomBytes(32).toString('hex');
  jar.set('gia_session', `${next}.${sign(next)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return next;
}
const ALLOWED_ERRORS = ['consent_required', 'invalid_contact', 'invalid_session', 'opted_out', 'session_full', 'session_unavailable', 'verification_required', 'invalid_message', 'unknown_action', 'otp_not_configured', 'otp_locked', 'otp_throttled', 'otp_dev_forbidden', 'malformed_request', 'request_too_large', 'wrong_program', 'invalid_program', 'unsupported_program_source'];
function fail(message: string) {
  return NextResponse.json({ error: ALLOWED_ERRORS.includes(message) ? message : 'service_unavailable' }, { status: message === 'request_too_large' ? 413 : ALLOWED_ERRORS.includes(message) ? 400 : 503 });
}
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function publicResult(value: unknown): Record<string, unknown> {
  const obj = asObject(value);
  const challenge = obj.challenge;
  if (challenge && typeof challenge === 'object') {
    const ch = challenge as Record<string, unknown>;
    return { ...obj, challenge: { id: ch.id, expiresAt: ch.expiresAt } };
  }
  return obj;
}
async function audit(id: string, metadata: { action: string; intent?: string | null; reason?: string | null; citation?: { id: string; version: string; source: string } | null; outcome: string }, messageText: string | null = null) {
  await repository.run(id, tx => tx.recordTurn(metadata, messageText));
}
function clientHash(req: Request) {
  return hashClientKey(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '');
}
function readProgram(body: Record<string, unknown>, jar: Awaited<ReturnType<typeof cookies>>) {
  const cookie = jar.get('gia_program');
  const resolved = resolveStoredProgram({
    hasBodyProgram: Object.prototype.hasOwnProperty.call(body, 'program'),
    bodyProgram: body.program,
    cookieProgram: cookie == null ? null : cookie.value,
  });
  if ('persist' in resolved && resolved.persist && resolved.program) {
    jar.set('gia_program', resolved.program, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
  }
  return resolved;
}
function programOrThrow(resolved: ReturnType<typeof resolveStoredProgram>): string {
  if ('error' in resolved && resolved.error) throw new Error(resolved.error);
  if (!('program' in resolved) || !resolved.program) throw new Error('invalid_program');
  return resolved.program;
}

/** Never persist pasted codes, OTPs, or contact-shaped chat in gia_turns.message_text. */
function storeableMessageText(text: string, intent: string | null, reason: string | null) {
  if (reason === 'documents' || intent === 'get_my_status') return null;
  if (looksLikeSecretToken(text) || looksLikeContact(text)) return null;
  return text;
}
export async function POST(req: Request) {
  if (process.env.GIA_PILOT_ENABLED !== 'true') return NextResponse.json({ error: 'pilot_disabled' }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    assertOtpDevNotProduction();
    if (looksLikeUploadPayload(null, req.headers.get('content-type') || '')) {
      const id = await identity();
      const discarded = discardedUploadResponse();
      await audit(id, { action: 'upload', intent: 'request_leader', reason: 'documents', outcome: 'discarded' });
      return NextResponse.json(discarded);
    }
    const raw = await req.text();
    const id = await identity();
    if (raw.length > 4096) {
      await recordRejected(repository, id, 'request_too_large');
      return NextResponse.json({ error: 'request_too_large' }, { status: 413 });
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('malformed_request');
      body = parsed as Record<string, unknown>;
    } catch {
      await recordRejected(repository, id, 'malformed_request');
      return NextResponse.json({ error: 'malformed_request' }, { status: 400 });
    }
    if (looksLikeUploadPayload(body, req.headers.get('content-type') || '')) {
      const discarded = discardedUploadResponse();
      await audit(id, { action: 'upload', intent: 'request_leader', reason: 'documents', outcome: 'discarded' });
      return NextResponse.json(discarded);
    }
    const jar = await cookies();
    const language = jar.get('gia_language')?.value;
    const ipHash = clientHash(req);
    const resolved = readProgram(body, jar);
    if (body.action === 'opt_out') {
      const result = await perform(repository, id, 'opt_out', {});
      return NextResponse.json(publicResult(result));
    }
    if (body.action === 'message') {
      if (typeof body.text !== 'string' || body.text.length > 1000) throw new Error('invalid_message');
      const engineProgram = 'program' in resolved && resolved.program ? resolved.program : LEAST_PRIVILEGED_PROGRAM;
      const response = respond(body.text, ['en', 'ceb', 'tl'].includes(language || '') ? language : 'en', knowledge, new Date(), { program: engineProgram });
      const reason = 'reason' in response && typeof response.reason === 'string' ? response.reason : null;
      const rawCitation = 'citation' in response ? response.citation : null;
      const citation = rawCitation && typeof rawCitation === 'object' && 'id' in rawCitation && 'version' in rawCitation && 'source' in rawCitation
        ? { id: String(rawCitation.id), version: String(rawCitation.version), source: String(rawCitation.source) }
        : null;
      if (response.intent === 'opt_out') return NextResponse.json(await perform(repository, id, 'opt_out', {}));
      const program = programOrThrow(resolved);
      // Suppression is checked before responding or changing language.
      const suppressed = await repository.run(id, tx => tx.suppressed());
      if (suppressed) {
        await audit(id, { action: 'message', intent: response.intent, reason, outcome: 'opted_out' });
        return NextResponse.json({ text: 'You previously opted out. Please contact your leader to discuss re-subscribing.' });
      }
      if (response.intent === 'language') jar.set('gia_language', response.language, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
      const storeText = storeableMessageText(body.text, response.intent, reason);
      // Only structured intent/citation metadata is retained for audit; document payloads are never saved.
      const extra = await repository.run(id, async tx => {
        const c = await tx.findCandidate();
        await tx.recordTurn({ action: 'message', intent: response.intent, reason, citation, outcome: 'ok' }, storeText);
        const listing = response.intent === 'list_fep_sessions' && /\b(show fep sessions|list fep sessions|list_fep_sessions|available fep|fep dates|fep seats)\b/i.test(String(body.text));
        await emitGiaEngagement(tx, id, {
          action: 'message',
          intent: listing ? null : response.intent,
          citation,
          conversation: !listing,
        });
        if (c?.consented && response.intent === 'request_leader') return { handoff: await tx.handoff(c, reason || 'unapproved_or_unknown') };
        return null;
      });
      if (response.intent === 'get_my_status') {
        try {
          const status = await perform(repository, id, 'get_my_status', { ...body, program, clientHash: ipHash });
          if (status && typeof status === 'object' && 'error' in status && (status.error === 'verification_required' || status.error === 'otp_locked')) {
            return NextResponse.json({ ...response, ...publicResult(status) }, { status: 400 });
          }
          return NextResponse.json({ ...response, ...publicResult(status), ...asObject(extra) });
        } catch (e) {
          const message = e instanceof Error ? e.message : '';
          if (message === 'consent_required') return NextResponse.json({ ...response, ...asObject(extra) });
          throw e;
        }
      }
      if (response.intent === 'list_fep_sessions' && /\b(show fep sessions|list fep sessions|list_fep_sessions|available fep|fep dates|fep seats)\b/i.test(String(body.text))) {
        const listed = await perform(repository, id, 'list_fep_sessions', { program });
        return NextResponse.json({ ...response, ...asObject(listed), ...asObject(extra) });
      }
      return NextResponse.json({ ...response, ...asObject(extra) });
    }
    if (typeof body.action !== 'string' || !(WORKFLOW_ACTIONS as readonly string[]).includes(body.action)) {
      await recordRejected(repository, id, 'unknown_action', typeof body.action === 'string' ? body.action : 'rejected');
      throw new Error('unknown_action');
    }
    const program = programOrThrow(resolved);
    const result = await perform(repository, id, body.action, { ...body, program, clientHash: ipHash });
    if (result && typeof result === 'object' && 'error' in result && (result.error === 'verification_required' || result.error === 'otp_locked')) {
      return NextResponse.json(publicResult(result), { status: 400 });
    }
    return NextResponse.json(publicResult(result));
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    return fail(message);
  }
}
