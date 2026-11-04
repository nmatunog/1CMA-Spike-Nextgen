import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { respond } from '@/lib/gia/engine.mjs';
import { perform } from '@/lib/gia/workflow.mjs';
import { repository, listSessions } from '@/lib/gia/repository';
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
export async function POST(req: Request) {
  if (process.env.GIA_PILOT_ENABLED !== 'true') return NextResponse.json({ error: 'pilot_disabled' }, { status: 503 });
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 4096) return NextResponse.json({ error: 'request_too_large' }, { status: 413 });
    const body = JSON.parse(raw);
    const id = await identity();
    const jar = await cookies();
    const language = jar.get('gia_language')?.value;
    if (body.action === 'message') {
      if (typeof body.text !== 'string' || body.text.length > 1000) throw new Error('invalid_message');
      const response = respond(body.text, ['en', 'ceb', 'tl'].includes(language || '') ? language : 'en');
      if (response.intent === 'opt_out') return NextResponse.json(await perform(repository, id, 'opt_out'));
      // Suppression is checked before responding or changing language.
      const suppressed = await repository.run(id, tx => tx.suppressed());
      if (suppressed) return NextResponse.json({ text: 'You previously opted out. Please contact your leader to discuss re-subscribing.' });
      if (response.intent === 'language') jar.set('gia_language', response.language, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
      // Only structured intent/citation metadata is retained, never raw chat or documents.
      await repository.run(id, async tx => {
        const c = await tx.findCandidate();
        if (c?.consented) {
          await tx.audit(c, { intent: response.intent, citation: response.citation || null });
        }
      });
      return NextResponse.json(response);
    }
    if (body.action === 'list_fep_sessions') return NextResponse.json({ sessions: await listSessions() });
    if (!['consent', 'book_fep', 'request_leader', 'get_my_status', 'opt_out'].includes(body.action)) throw new Error('unknown_action');
    return NextResponse.json(await perform(repository, id, body.action, body));
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    const allowed = ['consent_required', 'invalid_contact', 'invalid_session', 'opted_out', 'session_full', 'session_unavailable', 'verification_required', 'invalid_message', 'unknown_action'];
    return NextResponse.json({ error: allowed.includes(message) ? message : 'service_unavailable' }, { status: allowed.includes(message) ? 400 : 503 });
  }
}
