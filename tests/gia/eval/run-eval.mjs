import { randomUUID } from 'node:crypto';
import {
  respondOfficial,
  judgeOfficial,
  fingerprint,
  OFFICIAL_NOW,
  OPT_OUT_RESUBSCRIBE,
} from './official-v03.mjs';
import { perform } from '../../../lib/gia/workflow.mjs';
import { peekDevOtp, OTP_MAX_ATTEMPTS } from '../../../lib/gia/otp.mjs';

const consent = { agree: true, notice: 'gia-pilot-2026-11-04', name: 'Synthetic Official', email: 'official@example.test' };

export function nextSaturday(from) {
  const d = new Date(from);
  const add = ((6 - d.getUTCDay()) + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(9, 0, 0, 0);
  return d;
}

export async function seedSaturday(db, full = false) {
  const saturdayId = randomUUID();
  const laterId = randomUUID();
  const saturday = nextSaturday(OFFICIAL_NOW).toISOString();
  const later = new Date(OFFICIAL_NOW.getTime() + 14 * 86400000).toISOString();
  await db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,$2,$3)', [saturdayId, saturday, full ? 1 : 5]);
  await db.query('INSERT INTO fep_sessions(id,starts_at,capacity) VALUES($1,$2,5)', [laterId, later]);
  return { saturdayId, laterId };
}

export async function executeTurn(c, text, identity, session, repository) {
  const preview = respondOfficial(text, { program: 'recruit', consented: session.consented }, session.language);
  if (session.optedOut && !(preview.reason === 'urgent' && preview.citation?.id === 'KP-SAFETY-01')) {
    return { intent: 'opt_out', optedOut: true, language: session.language, text: OPT_OUT_RESUBSCRIBE };
  }
  if (!session.consented && /^(i agree|yes,? i agree)([.,!]?)$/i.test(text.trim())) {
    await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
    session.consented = true;
    return { intent: 'ask_consent', consented: true, language: session.language, text: 'Consent saved. How can I help?' };
  }
  const reply = respondOfficial(text, { program: 'recruit', consented: session.consented }, session.language);
  if (reply.intent === 'language') session.language = reply.language;
  if (reply.intent === 'opt_out') {
    try {
      await perform(repository, identity, 'opt_out', {});
    } catch { /* still opted out */ }
    session.optedOut = true;
    return { ...reply, optedOut: true };
  }
  if (reply.intent === 'get_my_status') {
    if (c.context?.otp_failed) {
      await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
      session.consented = true;
      await perform(repository, identity, 'get_my_status', { program: 'recruit' });
      let last = reply;
      const attempts = Number(c.context.otp_failed) || 3;
      for (let i = 0; i < Math.max(attempts, OTP_MAX_ATTEMPTS); i += 1) {
        last = await perform(repository, identity, 'get_my_status', { otp: '000000', program: 'recruit' });
      }
      return { ...reply, ...last, status: undefined };
    }
    if (c.context?.authenticated) {
      if (!session.consented) {
        await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
        session.consented = true;
      }
      await perform(repository, identity, 'get_my_status', { program: 'recruit' });
      const status = await perform(repository, identity, 'get_my_status', { otp: peekDevOtp(identity), program: 'recruit' });
      return { ...reply, ...status };
    }
    try {
      if (session.consented) {
        const status = await perform(repository, identity, 'get_my_status', { program: 'recruit' });
        return { ...reply, ...status, status: undefined };
      }
    } catch (e) {
      return { ...reply, error: e instanceof Error ? e.message : 'error' };
    }
    return reply;
  }
  if (reply.intent === 'list_fep_sessions') {
    if (session.consented) {
      const listed = await perform(repository, identity, 'list_fep_sessions', { program: 'recruit' });
      return { ...reply, ...listed };
    }
    return reply;
  }
  if (reply.intent === 'book_fep') {
    if (!session.consented) return reply;
    if (c.context?.saturday_full) {
      try {
        await perform(repository, identity, 'book_fep', { sessionId: session.saturdayId, program: 'recruit' });
      } catch (e) {
        const listed = await perform(repository, identity, 'list_fep_sessions', { program: 'recruit' });
        return {
          intent: 'list_fep_sessions',
          language: reply.language,
          text: 'This Saturday is full. I can show the next available FEP session.',
          sessions: listed.sessions,
          error: e instanceof Error ? e.message : 'error',
        };
      }
    }
    const booked = await perform(repository, identity, 'book_fep', { sessionId: session.saturdayId || session.laterId, program: 'recruit' });
    return { ...reply, ...booked };
  }
  const dualHandoff = reply.reason && (reply.intent === 'answer' || reply.intent === 'refuse')
    && ['urgent', 'licensing_detail', 'product_inquiry', 'documents'].includes(reply.reason);
  if ((reply.intent === 'request_leader' || dualHandoff) && session.consented && reply.reason) {
    try {
      const handoffReason = (reply.intent === 'refuse' && reply.reason === 'documents') ? 'licensing_detail' : reply.reason;
      const handoff = await perform(repository, identity, 'request_leader', { reason: handoffReason, program: 'recruit' });
      return { ...reply, ...handoff, reason: reply.reason, handoffReason };
    } catch {
      return reply;
    }
  }
  return reply;
}

export async function runCase(c, { db, repository }) {
  const identity = `eval-${c.id}-${randomUUID()}`;
  const session = {
    consented: c.context?.consent === true,
    language: c.context?.language === 'ceb' ? 'ceb' : c.context?.language === 'tl' ? 'tl' : 'en',
    optedOut: false,
    saturdayId: undefined,
    laterId: undefined,
  };
  if (c.context?.consent === true) {
    await perform(repository, identity, 'consent', { ...consent, email: `${identity}@example.test` });
  }
  if (c.expected?.includes('list_fep') || c.expected?.includes('book_fep') || c.context?.saturday_full || c.context?.has_booking || c.id === 'EV-069') {
    const seeded = await seedSaturday(db, !!c.context?.saturday_full);
    session.saturdayId = seeded.saturdayId;
    session.laterId = seeded.laterId;
  }
  if (c.context?.saturday_full) {
    await perform(repository, 'filler-sat', 'consent', { ...consent, email: `filler-${identity}@example.test` });
    await perform(repository, 'filler-sat', 'book_fep', { sessionId: session.saturdayId, program: 'recruit' });
  }
  if (c.context?.has_booking) {
    await perform(repository, identity, 'book_fep', { sessionId: session.laterId, program: 'recruit' });
  }
  const turns = c.turns?.length ? c.turns : [{ user_says: c.user_says, expected: c.expected }];
  const judgements = [];
  const outputs = [];
  for (const turn of turns) {
    const result = await executeTurn(c, turn.user_says, identity, session, repository);
    outputs.push(fingerprint(result));
    const judged = judgeOfficial({ ...c, flags: { ...c.flags, category: c.category || c.flags?.category } }, result, turn);
    judgements.push(judged);
  }
  return { judgements, fingerprint: outputs.join('||'), last: judgements[judgements.length - 1] };
}
