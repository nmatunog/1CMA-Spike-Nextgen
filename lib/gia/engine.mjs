// Pure, deterministic FAQ selection. No model, network access or paid APIs.
import { entries as shipped } from './knowledge/pack.mjs';
import { importKnowledge, isApproved } from './knowledge-import.mjs';
import { DOCUMENT_HANDOFF } from './uploads.mjs';
import { adapterAllowsTopic, programAdapter, programFromContext } from './programs.mjs';
import { isServableEntry, topicDomain } from './domains.mjs';
import { canReadDomain, visitorRole } from './capabilities.mjs';

export const NOTICE = 'gia-pilot-2026-11-04';
export const welcome = "I'm GIA — Your 1CMA AI Guide, an AI assistant for GIYA Institute — The SPIKE Method. I can welcome you, share approved recruitment and free program info, guide free Financial Literacy and free FEP, recommend next steps, and connect you with your assigned leader. Read the privacy notice before sharing information. We save a contact only with your consent. Type STOP to opt out. Please do not send IDs or documents.";
export const NEXT_STEP = {
  en: 'Start with free Financial Literacy, or go directly to the free Financial Entrepreneurship Preview. Book a session when you are ready, or ask for a 1CMA leader.',
  ceb: 'Sugod sa libreng Financial Literacy, o modiretso sa libreng Financial Entrepreneurship Preview. Magpa-book kung andam ka, o hangyo og 1CMA leader.',
  tl: 'Magsimula sa libreng Financial Literacy, o dumiretso sa libreng Financial Entrepreneurship Preview. Mag-book kapag handa ka, o humingi ng 1CMA leader.',
};
export const knowledge = importKnowledge(shipped).entries;
export const approved = isApproved;
export const GIA_TOOLS = Object.freeze(['list_fep_sessions', 'book_fep', 'request_leader', 'get_my_status', 'opt_out']);

/**
 * @typedef {object} GiaReply
 * @property {string} intent
 * @property {string} language
 * @property {string} text
 * @property {string} [reason]
 * @property {{ id: string, version: string, source: string }} [citation]
 */

/** @returns {GiaReply} */
function escalate(language, reason, text) {
  return { intent: 'request_leader', reason, language, text };
}

function canServeTopic(program, topic) {
  const role = visitorRole({ program });
  const domain = topicDomain(topic);
  return adapterAllowsTopic(program, topic) && (!domain || canReadDomain(role, domain));
}

/** @returns {GiaReply} */
export function respond(text, language = 'en', pack = knowledge, now = new Date(), context = {}) {
  const program = programFromContext(context);
  const adapter = programAdapter(program);
  const role = visitorRole({ program, consented: !!context.consented });
  const q = String(text).trim().toLowerCase();
  if (/\b(stop|unsubscribe|opt[ -]?out|ayoko na|hunong)\b/.test(q)) return { intent: 'opt_out', language, text: 'Your opt-out request will be saved before it is confirmed.' };
  const requested = /^(?:in )?(bisaya|cebuano|tagalog|english)( please)?[.!]?$/.test(q) || /\b(speak|use|switch|reply|respond|mag|paki)\b.*\b(bisaya|cebuano|tagalog|english)\b/.test(q);
  if (requested) {
    language = /bisaya|cebuano/.test(q) ? 'ceb' : /tagalog/.test(q) ? 'tl' : 'en';
    return { intent: 'language', language, text: language === 'ceb' ? 'Sige, mag-Bisaya ta. Unsa akong ikatabang?' : language === 'tl' ? 'Sige, mag-Tagalog tayo. Paano kita matutulungan?' : 'I will reply in English. How can I help?' };
  }
  if (/\b(document|passport|tin|sss|government id|photo of my id|upload|email my|resume|birth certificate|nbi|police clearance|attachment|selfie with id)\b/.test(q)) {
    return escalate(language, 'documents', DOCUMENT_HANDOFF);
  }
  if (/\b(create|generate|issue|mint|make|give me|send me|redeem|apply|use)\b.{0,40}\b(code|access code|activation code|l1|l2)\b|\b(access code|activation code) for me\b/.test(q)) {
    return escalate(language, 'boundary_codes', 'GIA never creates access codes. GIA never issues or redeems paid codes. Codes are issued outside GIA. I can connect you with a 1CMA leader.');
  }
  if (/\b(you('re| are) (hired|approved|coded|activated)|approve my (application|recruitment|coding)|i (approve|hire) you|mark me (as )?(hired|approved|coded|activated)|i am (now )?(hired|approved to sell))\b/.test(q)) {
    return escalate(language, 'boundary_decision', 'GIA never approves recruitment decisions. A 1CMA leader handles hiring, coding, and activation. I cannot invent your status.');
  }
  if (/\b(am i|confirm (i am|i'm)|tell me i am)\b.{0,24}\b(coded|activated|hired|approved|new lead|contacted)\b/.test(q)) {
    return { intent: 'get_my_status', language, text: 'Your own status requires a verified code sent to your saved contact. This pilot uses a mock OTP adapter only; no SMS or email provider is used. GIA never invents a candidate status.' };
  }
  if (/\b(i (already )?paid|payment (is |was )?verified|unlock (my |l2|access)|prove my payment|paid so|because i paid)\b/.test(q)) {
    return escalate(language, 'boundary_payment', 'GIA never treats payment as verified. Payment confirmation happens outside GIA. A 1CMA leader can help.');
  }
  if (/\b(grant|change|update)\b.{0,20}\b(entitlement|access|enrol+ment|l2)\b|\benroll me\b|\bactivate my (account|access|l2|advisor)\b/.test(q)) {
    return escalate(language, 'boundary_entitlements', 'GIA never changes entitlements or enrollments. A 1CMA leader can help route you to RA-SPIKE or SPIKE for Interns.');
  }
  if (/\b(someone else|another persons?|all candidates|other candidates?|other persons?)\b/.test(q)) {
    return escalate(language, 'restricted', 'I cannot verify or decide that. A 1CMA leader can help. Staff must use the Command Center for candidate records.');
  }
  if (/\b(status|my stage|my application)\b/.test(q)) {
    return { intent: 'get_my_status', language, text: 'Your own status requires a verified code sent to your saved contact. This pilot uses a mock OTP adapter only; no SMS or email provider is used.' };
  }
  if (/\b((cancel|change|reschedule|move|switch).{0,20}fep|fep.{0,20}(cancel|change|reschedule|move|switch)|cancel_fep)\b/.test(q)) {
    return escalate(language, 'fep_change', 'I cannot cancel or move an FEP booking. A 1CMA leader handles FEP changes. cancel_fep is not available in this pilot.');
  }
  if (/\b(ra-?spike|spike for interns|intern pathway)\b/.test(q)) {
    const reason = /intern/.test(q) ? 'route_spike_interns' : 'route_ra_spike';
    return escalate(language, reason, 'I cannot create access codes or change learning entitlements. A 1CMA leader can help route you to RA-SPIKE or SPIKE for Interns as appropriate.');
  }
  if (/\b(earn|income|salary|commission|guarantee|pass|eligible|refund|complaint|licen[sc]|exam|coding|agent code|distress|suicide|policy|insurance|internal|nexo|all candidates)\b/.test(q)) {
    return escalate(language, 'restricted', 'I cannot verify or decide that. A 1CMA leader can help. Staff must use the Command Center for candidate records.');
  }
  if (/\b(leader|human|person)\b/.test(q)) return escalate(language, 'leader_requested', 'With your consent and contact, I can save a request for a 1CMA leader.');
  if (/\b(show fep sessions|list fep sessions|list_fep_sessions|available fep|fep dates|fep seats)\b/.test(q)) {
    if (!adapter.tools.includes('list_fep_sessions')) {
      return escalate(language, 'wrong_program', `FEP session booking is part of the recruitment guide. ${adapter.pathway} uses a different adapter. I can connect you with a 1CMA leader, or you can switch GIA to Recruit. GIA does not open a learning portal.`);
    }
    return { intent: 'list_fep_sessions', language, text: 'I can show available FEP sessions. Booking is saved only after you confirm a session with remaining seats.' };
  }
  // Exact FAQ variants prevent compound/restricted questions from borrowing a safe keyword.
  const clean = q.replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  if (['what should i do next', 'what do i do next', 'next step', 'recommend next steps', 'where should i start', 'where do i start'].includes(clean)) {
    if (!canServeTopic(program, 'literacy') && !canServeTopic(program, 'fep')) {
      return escalate(
        language,
        adapter.escalateReason || 'wrong_program',
        `Approved answers for ${adapter.pathway} are not in this GIA guide yet. I can connect you with a 1CMA leader. GIA does not open a learning portal.`,
      );
    }
    const lit = pack.find(e => e.id === 'KP-LIT-01' && isApproved(e, now) && isServableEntry(e) && canReadDomain(role, 'financial-literacy'));
    return {
      intent: 'next_step',
      language,
      text: NEXT_STEP[language] || NEXT_STEP.en,
      citation: lit ? { id: lit.id, version: lit.version, source: lit.source } : undefined,
    };
  }
  const topic = ['financial literacy', 'literacy', 'what is financial literacy', 'tell me about financial literacy', 'join free financial literacy', 'is financial literacy free'].includes(clean) ? 'literacy' : ['fep', 'what is fep', 'is fep free', 'i am interested in fep', 'i want fep', 'explore free financial entrepreneurship preview', 'financial entrepreneurship preview'].includes(clean) ? 'fep' : null;
  if (topic && !canServeTopic(program, topic)) {
    return escalate(
      language,
      adapter.escalateReason || 'wrong_program',
      `Approved answers for ${adapter.pathway} are not in this GIA guide yet. I can connect you with a 1CMA leader. GIA does not open a learning portal.`,
    );
  }
  const matches = pack.filter(e => e.topic === topic && isApproved(e, now) && isServableEntry(e) && canServeTopic(program, e.topic));
  if (matches.length === 1) {
    const e = matches[0];
    if (e.answers[language]) return { intent: topic === 'fep' ? 'list_fep_sessions' : 'answer', language, text: e.answers[language], citation: { id: e.id, version: e.version, source: e.source } };
  }
  return escalate(language, 'unapproved_or_unknown', language === 'ceb' ? 'Wala pa koy aprobahan nga tubag niini. Mahimo kitang ikonektar sa usa ka 1CMA leader.' : language === 'tl' ? 'Wala pa akong aprubadong sagot dito. Maaari kitang ikonekta sa isang 1CMA leader.' : 'I do not have an approved answer for that yet. I can connect you with a 1CMA leader.');
}
