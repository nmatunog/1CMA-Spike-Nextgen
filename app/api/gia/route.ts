import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { respond } from '@/lib/gia/engine.mjs';
import { perform, WORKFLOW_ACTIONS } from '@/lib/gia/workflow.mjs';
import { repository } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { discardedUploadResponse, looksLikeUploadPayload } from '@/lib/gia/uploads.mjs';
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
function fail(message: string) {
  const allowed = ['consent_required', 'invalid_contact', 'invalid_session', 'opted_out', 'session_full', 'session_unavailable', 'verification_required', 'invalid_message', 'unknown_action', 'otp_not_configured'];
  return NextResponse.json({ error: allowed.includes(message) ? message : 'service_unavailable' }, { status: allowed.includes(message) ? 400 : 503 });
}
function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
async function audit(id: string, metadata: { action: string; intent?: string | null; reason?: string | null; citation?: { id: string; version: string; source: string } | null; outcome: string }, messageText: string | null = null) {
  await repository.run(id, tx => tx.recordTurn(metadata, messageText));
}
export async function POST(req: Request) {
  if (process.env.GIA_PILOT_ENABLED !== 'true') return NextResponse.json({ error: 'pilot_disabled' }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    if (looksLikeUploadPayload(null, req.headers.get('content-type') || '')) {
      const id = await identity();
      const discarded = discardedUploadResponse();
      await audit(id, { action: 'upload', intent: 'request_leader', reason: 'documents', outcome: 'discarded' });
      return NextResponse.json(discarded);
    }
    const raw = await req.text();
    if (raw.length > 4096) return NextResponse.json({ error: 'request_too_large' }, { status: 413 });
    const body = JSON.parse(raw);
    const id = await identity();
    if (looksLikeUploadPayload(body, req.headers.get('content-type') || '')) {
      const discarded = discardedUploadResponse();
      await audit(id, { action: 'upload', intent: 'request_leader', reason: 'documents', outcome: 'discarded' });
      return NextResponse.json(discarded);
    }
    const jar = await cookies();
    const language = jar.get('gia_language')?.value;
    if (body.action === 'message') {
      if (typeof body.text !== 'string' || body.text.length > 1000) throw new Error('invalid_message');
      const response = respond(body.text, ['en', 'ceb', 'tl'].includes(language || '') ? language : 'en');
      const reason = 'reason' in response && typeof response.reason === 'string' ? response.reason : null;
      const rawCitation = 'citation' in response ? response.citation : null;
      const citation = rawCitation && typeof rawCitation === 'object' && 'id' in rawCitation && 'version' in rawCitation && 'source' in rawCitation
        ? { id: String(rawCitation.id), version: String(rawCitation.version), source: String(rawCitation.source) }
        : null;
      if (response.intent === 'opt_out') return NextResponse.json(await perform(repository, id, 'opt_out'));
      // Suppression is checked before responding or changing language.
      const suppressed = await repository.run(id, tx => tx.suppressed());
      if (suppressed) {
        await audit(id, { action: 'message', intent: response.intent, reason, outcome: 'opted_out' });
        return NextResponse.json({ text: 'You previously opted out. Please contact your leader to discuss re-subscribing.' });
      }
      if (response.intent === 'language') jar.set('gia_language', response.language, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
      const storeText = reason === 'documents' || response.intent === 'get_my_status' ? null : body.text;
      // Only structured intent/citation metadata is retained for audit; document payloads are never saved.
      const extra = await repository.run(id, async tx => {
        const c = await tx.findCandidate();
        await tx.recordTurn({ action: 'message', intent: response.intent, reason, citation, outcome: 'ok' }, storeText);
        if (c?.consented && response.intent === 'request_leader') return { handoff: await tx.handoff(c, reason || 'unapproved_or_unknown') };
        return null;
      });
      if (response.intent === 'get_my_status') {
        try {
          const status = await perform(repository, id, 'get_my_status', body);
          if (status && typeof status === 'object' && 'error' in status && status.error === 'verification_required') {
            return NextResponse.json({ ...response, ...asObject(status) }, { status: 400 });
          }
          return NextResponse.json({ ...response, ...asObject(status), ...asObject(extra) });
        } catch (e) {
          const message = e instanceof Error ? e.message : '';
          if (message === 'consent_required') return NextResponse.json({ ...response, ...asObject(extra) });
          throw e;
        }
      }
      if (response.intent === 'list_fep_sessions' && /\b(show fep sessions|list fep sessions|list_fep_sessions|available fep|fep dates|fep seats)\b/i.test(body.text)) {
        const listed = await perform(repository, id, 'list_fep_sessions');
        return NextResponse.json({ ...response, ...asObject(listed), ...asObject(extra) });
      }
      return NextResponse.json({ ...response, ...asObject(extra) });
    }
    if (typeof body.action !== 'string' || !(WORKFLOW_ACTIONS as readonly string[]).includes(body.action)) throw new Error('unknown_action');
    const result = await perform(repository, id, body.action, body);
    if (result && typeof result === 'object' && 'error' in result && result.error === 'verification_required') {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    return fail(message);
  }
}
