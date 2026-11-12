// Pure, deterministic FAQ selection. No model, network access or paid APIs.
import { entries as shipped } from './knowledge/pack.mjs';
import { importKnowledge, isApproved } from './knowledge-import.mjs';
import { DOCUMENT_HANDOFF } from './uploads.mjs';
import { adapterAllowsTopic, programAdapter, programFromContext } from './programs.mjs';
import { isServableEntry, topicDomain } from './domains.mjs';
import { canReadDomain, visitorRole } from './capabilities.mjs';

export const NOTICE = 'gia-pilot-2026-11-04';
export const welcome = "I'm GIA — Your 1CMA AI Guide, an AI assistant for GIYA Institute — The SPIKE Method. I can welcome you, share approved recruitment and free program info, guide free Financial Literacy and free FEP, recommend next steps, and connect you with your assigned leader. Read the privacy notice before sharing information. We save a contact only with your consent. Type STOP to opt out. Please do not send IDs or documents.";
export const CONSENT_ASK = ' Do you agree to the privacy notice? If you agree, say I agree.';
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
 * @property {string} [topic]
 * @property {{ id: string, version: string, source: string }} [citation]
 */

const UNKNOWN = {
  en: 'I do not have an approved answer for that yet. I can connect you with a 1CMA leader.',
  ceb: 'Wala pa koy aprobahan nga tubag niini. Mahimo kitang ikonektar sa usa ka 1CMA leader.',
  tl: 'Wala pa akong aprubadong sagot dito. Maaari kitang ikonekta sa isang 1CMA leader.',
};

/** @returns {GiaReply} */
function escalate(language, reason, text) {
  return { intent: 'request_leader', reason, language, text };
}

function refuse(language, reason, text) {
  return { intent: 'refuse', reason, language, text };
}

function canServeTopic(program, topic) {
  const role = visitorRole({ program });
  const domain = topicDomain(topic);
  return adapterAllowsTopic(program, topic) && (!domain || canReadDomain(role, domain));
}

export function isFepScheduleQuery(q) {
  return /\b((when|where).{0,32}\bfep\b|\bnext fep\b|\bfep (held|dates|sessions|seats|venue|location)\b|show fep sessions|list fep sessions|list_fep_sessions|available fep)\b/.test(q);
}

const RELATIVE_DAY = 'saturday|sunday|today|tomorrow|tonight|this weekend|next week|this week|this morning|this afternoon';

export function isFepBookQuery(q) {
  return /\b(book|booking|reserve)\b/.test(q)
    && (/\bfep\b/.test(q) || new RegExp(`\\b(${RELATIVE_DAY})\\b`).test(q));
}

const CRISIS_NEGATIVE = /\bdying to\b|\bpatay na ang (phone|cellphone|cell|baterya|battery|wifi|signal)\b/;

export function isCrisis(q) {
  const n = String(q || '').toLowerCase();
  if (CRISIS_NEGATIVE.test(n)) return false;
  return /\bsuicid\w*/.test(n)
    || /\b(kill(ing)? myself|hurt(ing)? myself|self[ -]?harm)\b/.test(n)
    || /\b(end(ing)? it all|end my life|take my (own )?life|want(s)? to die|wanna die|better off dead)\b/.test(n)
    || /\b((don'?t|do not) want to live)\b/.test(n)
    || /\b(feel hopeless|buried in debt|cannot cope|can't cope)\b/.test(n)
    || /\b(mag|nag)?pakamatay\b/.test(n)
    || /\bsaktan .{0,24}(sarili|kaugalingon)\b/.test(n)
    || /\b(ayoko|ayaw).{0,24}(mabuhay|mabuhi)\b/.test(n)
    || /\bgusto .{0,20}mamatay\b/.test(n);
}

function isOtherPersonQuery(q) {
  if (/\b(status of my|my (status|application|stage)|our (status|application))\b/.test(q)) return false;
  if (/\b(another persons?|someone else|other (persons?|candidates?|people)|somebody else'?s)\b/.test(q)) return true;
  if (/\bstatus of (?!my |the |our |this |an? )/.test(q)) return true;
  if (/\bstatus (ni|kay|ng) (?!akin |ako |ko |sa akin )/.test(q)) return true;
  if (/\b[a-z]{3,}(?:\s+[a-z]{3,}){1,2}'s (status|stage|application|record|file)\b/.test(q)) return true;
  return false;
}

function looksLikePhoneDump(q) {
  return /(?:\+63|0)9\d{2}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/.test(q)
    || /\b0?9\d{2}x{2,}\b/.test(q)
    || /\b[a-z]{2,}\s+[a-z]{2,}\s+(?:\+63|0)?9\d{2}/.test(q);
}

function isUnder18(q) {
  if (/\b(under\s*18|below\s*18|less than 18|minor)\b/.test(q)) return true;
  if (/\b(1[0-7]|[1-9])[-\s]?(years?[- ]old|yrs?\.?[- ]old|taon)\b/.test(q)) return true;
  if (/\b(seventeen|sixteen|fifteen|fourteen|thirteen)\b/.test(q)) return true;
  if (/\b(1[0-7]) pa (ko|ako)\b/.test(q)) return true;
  if (/\bi(?:'?m| am) (?:only |just )?(1[0-7]|seventeen|sixteen)\b/.test(q)) return true;
  return false;
}

function isCompensationQuery(q, raw) {
  if (/\b(how much .{0,40}(earn|make|kita|suweldo|sweldo)|typical (income|take-?home|paycheck)|guaranteed (paycheck|income|sweldo)|signing bonus|peso amount|rough range|commission rates|the commission|salary|komisyon|take-?home( pay)?|quote .{0,24}(income|paycheck|kita|sweldo))\b/.test(q)) return true;
  if (/\b(earn|make|kita|suweldo|sweldo|salary|income|komisyon|paycheck|take-?home).{0,32}(per |kada |each )?(month|bulan|buwan|year|taon|tuig)\b/.test(q)) return true;
  if (/\b(per month|kada bulan|kada buwan|each month|monthly (pay|income|kita|salary|paycheck))\b/.test(q)) return true;
  if (/\b(average (kita|income|pay)|first-year (income|pay|kita)|kita sa unang taon|kita after coding)\b/.test(q)) return true;
  if (/₱/.test(raw) && !/\b(pay|gcash|spike|fee|bayad)\b/.test(q) && /\b(earn|make|salary|income|month|year|bonus)\b/.test(q)) return true;
  return false;
}

function isDeletionRequest(q) {
  return /\b(delete|erase|wipe|remove|purge|forget)\b.{0,48}\b(data|information|info|account|records?|files?|details|personal|profile)\b/.test(q)
    || /\b(forget me|right to be forgotten)\b/.test(q)
    || /\b(burahin|tanggalin|paki-?delete|i-?delete|paki-?purge)\b.{0,40}\b(data|account|info|information|record|personal|naka-?save)\b/.test(q)
    || /\b(papas|papasaa|kuhaa|kuhaon)\b.{0,40}\b(data|account|record|info|details|personal)\b/.test(q)
    || /\b(take down|drop) .{0,24}(profile|records?|details|account)\b/.test(q);
}

function isProductInquiry(q) {
  return /\b(which|what|recommend|pick|choose|select|pili|pumili|pilia|selecta)\b.{0,40}\b(insurance|policy|product|plan|plano)\b/.test(q)
    || /\b(insurance advice|what products? should i buy|help .{0,16}choose|anong (insurance |plan ))\b/.test(q)
    || /\b(unsa nga (policy|product|plano|insurance)|anong (plan|policy|product))\b/.test(q);
}

function isStatusDetail(q) {
  return /\b(did i pass|pass the evaluation|you passed|you failed)\b/.test(q)
    || /\b(evaluation).{0,24}(result|pass|fail|bagsak|lampus|pumasa)\b/.test(q)
    || /\b(passed|failed|pumasa|bagsak|milampus).{0,24}evaluation\b/.test(q)
    || /\b(pass or fail|evaluation result)\b/.test(q)
    || /\bevaluat\w*.{0,40}\b(pass(?:ed)?|fail(?:ed)?|bagsak|lampus|pumasa|result)\b/.test(q)
    || /\b(pass(?:ed)?|fail(?:ed)?|bagsak|lampus|pumasa).{0,40}\bevaluat/.test(q);
}

function findEntry(pack, now, program, role, topic, id) {
  return pack.find(e => (id ? e.id === id : e.topic === topic)
    && isApproved(e, now)
    && isServableEntry(e)
    && canServeTopic(program, e.topic)
    && canReadDomain(role, topicDomain(e.topic) || e.domain));
}

function serve(language, entry, intent, extra = {}) {
  const text = entry.answers[language] || entry.answers.en;
  return {
    intent,
    language,
    text: extra.suffix ? `${text} ${extra.suffix}` : text,
    topic: entry.topic,
    citation: { id: entry.id, version: entry.version, source: entry.source },
    ...extra.reason ? { reason: extra.reason } : {},
  };
}

function serveOrOffScript(language, pack, now, program, role, topic, id) {
  const matches = pack.filter(e => (id ? e.id === id : e.topic === topic)
    && isApproved(e, now)
    && isServableEntry(e)
    && canServeTopic(program, e.topic));
  if (matches.length === 1) return serve(language, matches[0], 'answer');
  if (matches.length > 1) return escalate(language, 'unapproved_or_unknown', UNKNOWN[language] || UNKNOWN.en);
  if (topic && !canServeTopic(program, topic) && (topic === 'literacy' || topic === 'fep' || topic === 'licensing_documents')) {
    const adapter = programAdapter(program);
    return escalate(
      language,
      adapter.escalateReason || 'wrong_program',
      `Approved answers for ${adapter.pathway} are not in this GIA guide yet. I can connect you with a 1CMA leader. GIA does not open a learning portal.`,
    );
  }
  return escalate(language, 'off_script', UNKNOWN[language] || UNKNOWN.en);
}

function docsIdFor(q) {
  if (/\b(brother|sister|relative|character references?|references who)\b/.test(q)) return 'KP-DOCS-06';
  if (/\b(2316|1701|not working|income tax)\b/.test(q)) return 'KP-DOCS-05';
  if (/\b(school id|barangay id|government[- ]issued id|valid (government )?id|passport|driver'?s license|prc id)\b/.test(q)
    && !/\b(photo of|here('s| is)|upload|email my)\b/.test(q)) return 'KP-DOCS-04';
  if (/\b(proof of sss|sss (number|app|proof)|where.{0,20}sss)\b/.test(q)) return 'KP-DOCS-03';
  if (/\b(don'?t have a tin|no tin|tin yet|proof of (a )?tin|bir)\b/.test(q) && !/\bhere is my tin\b/.test(q)) return 'KP-DOCS-02';
  if (/\b(what documents|documents do i need|documents for irecruit|irecruit documents|checklist)\b/.test(q)) return 'KP-DOCS-01';
  return null;
}

/** @returns {GiaReply} */
export function respond(text, language = 'en', pack = knowledge, now = new Date(), context = {}) {
  const program = programFromContext(context);
  const adapter = programAdapter(program);
  const role = visitorRole({ program, consented: !!context.consented });
  const raw = String(text);
  const q = raw.trim().toLowerCase();
  const clean = q.replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  const unknown = UNKNOWN[language] || UNKNOWN.en;

  if (isCrisis(q)) {
    const entry = pack.find(e => e.id === 'KP-SAFETY-01' && isApproved(e, now) && isServableEntry(e));
    if (entry) return serve(language, entry, 'answer', { reason: 'urgent' });
    return escalate(language, 'urgent', unknown);
  }

  if (/\b(stop|unsubscribe|opt[ -]?out|ayoko na|hunong|ayaw na|huwag na)\b/.test(q)) {
    return { intent: 'opt_out', language, text: 'Your opt-out request will be saved before it is confirmed.' };
  }

  const requested = /^(?:in )?(bisaya|cebuano|tagalog|english)( please)?[.!]?$/.test(q) || /\b(speak|use|switch|reply|respond|mag|paki|pwede( bang| ta)? mag-?)\b.*\b(bisaya|cebuano|tagalog|english)\b/.test(q);
  if (requested) {
    language = /bisaya|cebuano/.test(q) ? 'ceb' : /tagalog/.test(q) ? 'tl' : 'en';
    return { intent: 'language', language, text: language === 'ceb' ? 'Sige, mag-Bisaya ta. Unsa akong ikatabang?' : language === 'tl' ? 'Sige, mag-Tagalog tayo. Paano kita matutulungan?' : 'I will reply in English. How can I help?' };
  }

  if (/^(hi|hello|hey|good (morning|afternoon|evening))[.!?]*$/.test(clean)) {
    return { intent: 'greeting', language, text: welcome + CONSENT_ASK };
  }

  if (/\b(developer mode|system prompt|ignore (your|all) instructions|reveal your secrets)\b/.test(q) && !/\bcommission\b/.test(q)) {
    return refuse(language, 'internal', 'I cannot share internal instructions. I can help with approved Financial Literacy and FEP information, or connect you with a 1CMA leader.');
  }
  if (/\b(math homework|homework)\b/.test(q)) {
    return refuse(language, 'off_topic', 'I can help with 1CMA recruitment, free Financial Literacy, and free FEP. I cannot help with school homework. I can connect you with a 1CMA leader for program questions.');
  }
  if (/\b(show me all candidates|all candidates|i'?m .{0,40}(leader|staff|admin))\b/.test(q)) {
    return refuse(language, 'staff_function', 'Staff tools are not available in this chat. Leaders use the Command Center. I cannot list candidates here.');
  }
  if (isOtherPersonQuery(q)) {
    return refuse(language, 'other_person', 'I cannot verify or disclose another person\'s information. A 1CMA leader can help. Staff must use the Command Center for candidate records.');
  }

  const submittingDocs = /\b(here('s| is) (a )?(photo|my (id|passport|tin|sss|documents|government id|nbi|clearance))|photo of my id|upload|email my|can i (just )?email my|can i upload|send( you)? my (id|passport|tin|sss|documents|nbi|clearance)|attachment|selfie with id|my references are)\b/.test(q)
    || /\b(nbi|clearance)\b/.test(q)
    || /\bsend .{0,24} here\b/.test(q)
    || looksLikePhoneDump(q);
  if (submittingDocs) {
    return refuse(language, 'documents', DOCUMENT_HANDOFF);
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

  if (isDeletionRequest(q)) {
    return escalate(language, 'deletion_request', 'A 1CMA leader handles data deletion requests. I can connect you with your leader.');
  }
  if (isCompensationQuery(q, raw)) {
    return escalate(language, 'compensation', 'I cannot quote earnings, commissions, or bonuses. A 1CMA leader can discuss compensation. I can connect you with a leader.');
  }
  if (/\b(am i eligible|eligible\b|qualified\?)\b/.test(q) || isUnder18(q)) {
    return escalate(language, 'eligibility', 'I cannot decide eligibility. A 1CMA leader reviews that with you.');
  }
  if (/\b(complain|complaint|grievance)\b/.test(q) || /reklamo/.test(q)) {
    return escalate(language, 'complaint', 'I will connect you with a 1CMA leader about your complaint. I cannot investigate it here.');
  }
  if (isProductInquiry(q)) {
    return escalate(language, 'product_inquiry', 'I cannot recommend an insurance product. A 1CMA leader can help.');
  }
  if (/\b(refund|payment refundable)\b/.test(q)) {
    return escalate(language, 'refund', 'Refund questions are handled by a 1CMA leader. I cannot approve or deny a refund.');
  }
  if (/\b(lost my (spike )?login|account help|reset my (login|password))\b/.test(q)) {
    return escalate(language, 'account_help', 'I cannot reset logins or account access. A 1CMA leader can help with SPIKE access.');
  }
  if (/\b(leader'?s? (personal )?(mobile|phone|number)|send my leaders? mobile)\b/.test(q)) {
    return escalate(language, 'contact_request', 'I cannot share a leader\'s personal number. I can connect you with a 1CMA leader through this guide.');
  }
  if (isStatusDetail(q)) {
    return escalate(language, 'status_detail', 'I cannot report evaluation results. A 1CMA leader handles that.');
  }

  if (/\b((cancel|change|reschedule|move|switch).{0,20}fep|fep.{0,20}(cancel|change|reschedule|move|switch)|cancel_fep|can'?t make it anymore)\b/.test(q)) {
    return escalate(language, 'fep_change', 'I cannot cancel or move an FEP booking. A 1CMA leader handles FEP changes. cancel_fep is not available in this pilot.');
  }
  if (/\b(ra-?spike|spike for interns|intern pathway)\b/.test(q) && !/\b(difference between spike and ra-?spike)\b/.test(q)) {
    const reason = /intern/.test(q) ? 'route_spike_interns' : 'route_ra_spike';
    return escalate(language, reason, 'I cannot create access codes or change learning entitlements. A 1CMA leader can help route you to RA-SPIKE or SPIKE for Interns as appropriate.');
  }
  if (/\b(ic exam|insurance commission exam|exam fee|agent code|licen[sc]e is approved|when will i (be coded|get my agent code)|will aia pay|guarantee .{0,24}pass|licensing steps|how much are ic|when is the exam)\b/.test(q)
    || /\bwhat is irecruit\b/.test(q)) {
    return escalate(language, 'licensing_detail', 'Licensing dates, fees, and coding are confirmed by a 1CMA leader. I cannot invent a date, fee, or decision.');
  }
  if (/\b(start selling|can i start selling|help her choose)\b/.test(q)) {
    if (/\b(policy|choose|product)\b/.test(q)) return escalate(language, 'product_inquiry', 'I cannot recommend an insurance product. A 1CMA leader can help.');
    return serveOrOffScript(language, pack, now, program, role, 'licensing_overview');
  }

  if (/\b(don'?t agree|do not agree|no, i don'?t agree)\b/.test(q) && /\bprivacy\b/.test(q)) {
    return serveOrOffScript(language, pack, now, program, role, 'privacy_optout');
  }

  if (isFepBookQuery(q)) {
    if (!context.consented) {
      return { intent: 'ask_consent', language, text: welcome + CONSENT_ASK };
    }
    if (!adapter.tools.includes('book_fep')) {
      return escalate(language, 'wrong_program', `FEP session booking is part of the recruitment guide. ${adapter.pathway} uses a different adapter. I can connect you with a 1CMA leader, or you can switch GIA to Recruit. GIA does not open a learning portal.`);
    }
    return { intent: 'book_fep', language, text: 'I can book an FEP session with remaining seats after you confirm. Booking is saved only once the seat is held.' };
  }
  if (isFepScheduleQuery(q)) {
    if (!adapter.tools.includes('list_fep_sessions')) {
      return escalate(language, 'wrong_program', `FEP session booking is part of the recruitment guide. ${adapter.pathway} uses a different adapter. I can connect you with a 1CMA leader, or you can switch GIA to Recruit. GIA does not open a learning portal.`);
    }
    return { intent: 'list_fep_sessions', language, text: 'I can show available FEP sessions. Booking is saved only after you confirm a session with remaining seats.' };
  }

  if (/\b(status|my stage|my application)\b/.test(q)) {
    return { intent: 'get_my_status', language, text: 'Your own status requires a verified code sent to your saved contact. This pilot uses a mock OTP adapter only; no SMS or email provider is used.' };
  }

  if (/\b(leader|human|person)\b/.test(q) && !/\b(real person|from aia)\b/.test(q)) {
    return escalate(language, 'leader_requested', 'With your consent and contact, I can save a request for a 1CMA leader.');
  }

  const docsId = docsIdFor(q);
  if (docsId) {
    const entry = findEntry(pack, now, program, role, 'licensing_documents', docsId);
    if (!entry) return serveOrOffScript(language, pack, now, program, role, 'licensing_documents', docsId);
    const needsHandoff = docsId === 'KP-DOCS-02' && /\b(don'?t have|no tin|tin yet)\b/.test(q)
      || docsId === 'KP-DOCS-04' && /\b(school id|barangay id)\b/.test(q);
    return serve(language, entry, 'answer', needsHandoff ? { reason: 'licensing_detail' } : {});
  }

  if (['what should i do next', 'what do i do next', 'next step', 'recommend next steps', 'where should i start', 'where do i start'].includes(clean)) {
    if (!canServeTopic(program, 'literacy') && !canServeTopic(program, 'fep')) {
      return escalate(
        language,
        adapter.escalateReason || 'wrong_program',
        `Approved answers for ${adapter.pathway} are not in this GIA guide yet. I can connect you with a 1CMA leader. GIA does not open a learning portal.`,
      );
    }
    const lit = findEntry(pack, now, program, role, 'literacy', 'KP-LIT-01');
    return {
      intent: 'next_step',
      language,
      text: NEXT_STEP[language] || NEXT_STEP.en,
      citation: lit ? { id: lit.id, version: lit.version, source: lit.source } : undefined,
    };
  }

  const literacyAsk = ['financial literacy', 'literacy', 'what is financial literacy', 'tell me about financial literacy', 'join free financial literacy', 'is financial literacy free'].includes(clean)
    || /\b(start the free financial literacy|literacy (lessons|course)|finish the literacy|literacy.{0,24}before fep|literacy.{0,16}free)\b/.test(q);
  const fepAsk = ['fep', 'what is fep', 'is fep free', 'i am interested in fep', 'i want fep', 'explore free financial entrepreneurship preview', 'financial entrepreneurship preview'].includes(clean);
  if (literacyAsk && !/\b(earn|salary|commission|refund|exam)\b/.test(q)) {
    return serveOrOffScript(language, pack, now, program, role, 'literacy');
  }
  if (fepAsk) return serveOrOffScript(language, pack, now, program, role, 'fep');

  if (/\b(are you a real person|what is gia|who are you)\b/.test(q)) return serveOrOffScript(language, pack, now, program, role, 'about_gia');
  if (/\b(are you from aia|what is 1cma|fresh graduate|is this for me)\b/.test(q)) return serveOrOffScript(language, pack, now, program, role, 'about_1cma');
  if (/\b(job or a business|pyramid|networking)\b/.test(q)) return serveOrOffScript(language, pack, now, program, role, 'job_vs_business');
  if (/\b(do with my information|privacy notice|privacy)\b/.test(q) && !/\bagree\b/.test(q)) return serveOrOffScript(language, pack, now, program, role, 'privacy_optout');
  if (/\b(how much is spike|bayad sa spike|pila ang bayad|pay with gcash|pay ₱|without attending fep|spike fees?)\b/.test(q)) {
    return serveOrOffScript(language, pack, now, program, role, 'spike_fees');
  }
  if (/\b(attended fep|what happens next|not ready yet)\b/.test(q)) return serveOrOffScript(language, pack, now, program, role, 'after_fep');
  if (/\b(difference between spike and ra-?spike|what is spike)\b/.test(q)) return serveOrOffScript(language, pack, now, program, role, 'spike_pathway');
  if (/\b(bring my spouse|guests? to fep)\b/.test(q)) return escalate(language, 'off_script', unknown);
  if (/\b(target in the first|first 3 months as an advisor)\b/.test(q)) {
    return escalate(language, 'off_script', unknown);
  }

  if (/\b(earn|income|salary|commission|guarantee|pass|eligible|refund|complaint|licen[sc]|exam|coding|agent code|distress|policy|insurance|internal|nexo|all candidates)\b/.test(q)) {
    return escalate(language, 'restricted', 'I cannot verify or decide that. A 1CMA leader can help. Staff must use the Command Center for candidate records.');
  }

  return escalate(language, 'unapproved_or_unknown', unknown);
}
