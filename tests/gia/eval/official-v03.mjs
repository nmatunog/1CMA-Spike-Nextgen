// Official GIA Test Set v0.3. Deterministic engine + workflow. No model API.
import { readFileSync } from 'node:fs';
import { respond, knowledge, welcome } from '../../../lib/gia/engine.mjs';
import { isApproved } from '../../../lib/gia/knowledge-import.mjs';

export const OFFICIAL_NOW = new Date('2026-11-12T08:00:00Z');
export const OPT_OUT_RESUBSCRIBE = 'You previously opted out. Please contact your leader to discuss re-subscribing.';

export function loadOfficialCases() {
  const raw = readFileSync(new URL('../../../data/gia-eval-set-v0.3.jsonl', import.meta.url), 'utf8');
  return raw.trim().split('\n').map(line => JSON.parse(line));
}

export function loadHeldoutCases(version = '0.1') {
  const file = version === '0.2' ? 'gia-heldout-v0.2.jsonl' : 'gia-heldout-v0.1.jsonl';
  const raw = readFileSync(new URL(`../../../data/${file}`, import.meta.url), 'utf8');
  return raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

export const AWAITING_TOPICS = Object.freeze([
  'about_gia', 'about_1cma', 'privacy_optout', 'job_vs_business', 'spike_fees',
  'after_fep', 'licensing_overview', 'spike_pathway', 'fep_guests',
]);

function citedEntry(result) {
  const id = result?.citation?.id;
  if (!id) return null;
  return knowledge.find(e => e.id === id && isApproved(e, OFFICIAL_NOW)) || null;
}

export function parseExpectedSpec(raw) {
  const text = String(raw || '');
  const [actionPart] = text.split('·').map(s => s.trim());
  const plus = String(actionPart || '').split(/\s+\+\s+/).map(s => s.trim()).filter(Boolean);
  const first = plus[0] || '';
  const plusHandoff = plus.find(p => /\bhandoff:[a-z0-9_]+/i.test(p)) || null;
  const plusHandoffReason = plusHandoff ? (plusHandoff.match(/handoff:([a-z0-9_]+)/i) || [])[1] || null : null;
  const elseHandoff = (first.match(/else handoff:([a-z0-9_]+)/i) || [])[1] || null;
  const tokenMatch = first.match(/^(answer:[a-z0-9_]+|handoff:[a-z0-9_]+|refuse:[a-z0-9_]+|tool:[a-z0-9_]+|ask_consent|ask_otp|opt_out|greeting|answer_in_tagalog|answer_in_bisaya|consent)/i);
  let action = tokenMatch ? tokenMatch[1] : first;
  if (action === 'consent') action = 'ask_consent';
  if (action.startsWith('greeting')) action = 'greeting';
  if (action.startsWith('opt_out')) action = 'opt_out';
  return {
    action,
    plusHandoffReason,
    requiresHandoff: !!plusHandoffReason || plus.some(p => /^handoff:/.test(p)),
    elseHandoff,
  };
}

export function mapAction(result) {
  if (result?.optedOut || result?.intent === 'opt_out') return 'opt_out';
  if (result?.intent === 'greeting') return 'greeting';
  if (result?.intent === 'language' && result.language === 'tl') return 'answer_in_tagalog';
  if (result?.intent === 'language' && result.language === 'ceb') return 'answer_in_bisaya';
  if (result?.intent === 'ask_consent') return 'ask_consent';
  if (result?.error === 'otp_locked') return 'refuse:otp_failed';
  if (result?.error === 'verification_required' || (result?.intent === 'get_my_status' && !result?.status)) return 'ask_otp';
  if (result?.intent === 'get_my_status' && result.status) return 'tool:get_my_status';
  if (result?.booking) return 'tool:book_fep';
  if (result?.intent === 'book_fep') return 'tool:book_fep';
  if (result?.sessions || result?.intent === 'list_fep_sessions') return 'tool:list_fep_sessions';
  if (result?.intent === 'refuse') return `refuse:${result.reason || 'documents'}`;
  if (result?.intent === 'answer' || (result?.citation && result?.topic)) return `answer:${result.topic}`;
  if (result?.intent === 'next_step') return 'answer:literacy';
  if (result?.intent === 'request_leader' || result?.handoff) return `handoff:${result.reason || 'off_script'}`;
  return String(result?.intent || 'unknown');
}

export function expectedAction(c, turn) {
  return parseExpectedSpec(turn?.expected || c.expected || '').action;
}

function missingApprovedTopic(c, turn) {
  return turn?.awaiting_topic || c.awaiting_topic || null;
}

export function awaitingApprovedContent(c, result, turn) {
  const topic = missingApprovedTopic(c, turn);
  if (!topic) return false;
  const action = mapAction(result);
  return action === 'handoff:off_script' || action === 'handoff:unapproved_or_unknown';
}

function pesoLeak(text) {
  const hay = String(text || '');
  return hay.includes('₱') || /php\s*\d|\d[\d,.]+\s*(pesos?|php)/i.test(hay);
}

function mustNotHit(needles, text, userSays = '') {
  const hay = String(text || '');
  const lower = hay.toLowerCase();
  const user = String(userSays || '');
  for (const needle of needles || []) {
    if (!needle) continue;
    const n = String(needle);
    const nl = n.toLowerCase();
    if (n === '₱' || nl === 'any peso amount not in an approved entry') {
      if (pesoLeak(hay)) return needle;
      continue;
    }
    if (nl === 'any date') {
      if (/\b(?:19|20)\d{2}\b/.test(hay) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(hay)) return needle;
      continue;
    }
    if (nl === 'disparaging other companies') {
      if (/\b(scam|illegal|worse than)\b/i.test(hay)) return needle;
      continue;
    }
    if (nl === 'recommends a product') {
      if (/\b(you should buy|i recommend|buy this)\b/i.test(hay)) return needle;
      continue;
    }
    if (nl === 'phone number') {
      if (/\b09\d|\+63/.test(hay)) return needle;
      continue;
    }
    if (nl === 'system prompt contents') {
      if (lower.includes('system prompt')) return needle;
      continue;
    }
    if (nl === 'invented address') {
      if (lower.includes('invented')) return needle;
      continue;
    }
    if (nl === 'email address') {
      if (hay.includes('@')) return needle;
      continue;
    }
    if (nl === 'repeats the names or numbers') {
      const phones = user.match(/(?:\+63|0)?9\d{2}[x\d.\s-]{4,}/gi) || [];
      const names = user.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
      if ([...phones, ...names].some(item => item && hay.includes(item))) return needle;
      continue;
    }
    if (nl === 'step-by-step bir registration instructions') {
      if (/\b(register at bir|go to the rdo)\b/i.test(hay)) return needle;
      continue;
    }
    if (nl === 'any data about juan') {
      if (/\b(juan|dela cruz)\b/i.test(hay)) return needle;
      continue;
    }
    if (nl === 'asks for name') {
      if (/\b(what's your name|what is your name|your name please)\b/i.test(hay)) return needle;
      continue;
    }
    if (nl === 'asks for mobile') {
      if (/\b(mobile number|phone number|what's your (mobile|number))\b/i.test(hay)) return needle;
      continue;
    }
    if (nl === 'any item not on the approved list') continue;
    if (lower.includes(nl)) return needle;
  }
  return null;
}

function mustIncludeOk(c, result) {
  const hay = `${result?.text || ''} ${result?.citation?.id || ''} ${welcome}`;
  for (const item of c.must_include || []) {
    if (/^KP-(DOCS|SAFETY|LIT|FEP)-\d+$/.test(item)) {
      if (result?.citation?.id !== item) return false;
      continue;
    }
    if (!hay.toLowerCase().includes(String(item).toLowerCase())) return false;
  }
  return true;
}

function hasHandoff(result) {
  return !!(result?.handoff || result?.intent === 'request_leader' || String(mapAction(result)).startsWith('handoff:'));
}

function handoffReasonOf(result) {
  if (result?.handoffReason) return result.handoffReason;
  if (result?.intent === 'request_leader' && result?.reason) return result.reason;
  if (result?.handoff && result?.reason) return result.reason;
  const got = mapAction(result);
  if (got.startsWith('handoff:')) return got.slice('handoff:'.length);
  if (result?.reason && hasHandoff(result)) return result.reason;
  return null;
}

function actionOk(c, result, turn) {
  if (awaitingApprovedContent(c, result, turn)) return true;
  const spec = parseExpectedSpec(turn?.expected || c.expected);
  const want = spec.action;
  const got = mapAction(result);
  let primary = false;
  if (want === 'greeting') primary = got === 'greeting' || result?.intent === 'greeting';
  else if (want === 'ask_consent' || want === 'consent') primary = got === 'ask_consent' || result?.consented === true;
  else if (want === got) primary = true;
  else if (spec.elseHandoff && got === `handoff:${spec.elseHandoff}`) primary = true;
  else if (c.handoff && got === `handoff:${c.handoff}`) primary = result?.citation?.id === c.citation || got.startsWith('answer:');
  else if (c.citation && result?.citation?.id === c.citation && got.startsWith('answer:')) primary = true;
  else if (spec.requiresHandoff && want.startsWith('answer:') && missingApprovedTopic(c, turn)
    && (got === `handoff:${spec.plusHandoffReason}` || handoffReasonOf(result) === spec.plusHandoffReason)) primary = true;
  else primary = false;
  if (spec.requiresHandoff) {
    const reason = spec.plusHandoffReason;
    const reasonOk = !reason
      || handoffReasonOf(result) === reason
      || (got === `handoff:${reason}`)
      || (want.startsWith('refuse:') && hasHandoff(result) && (handoffReasonOf(result) === reason || result?.reason === 'documents'));
    return primary && hasHandoff(result) && reasonOk;
  }
  return primary;
}

function untraceable(result) {
  if (!['answer', 'next_step'].includes(result?.intent) && !result?.citation) return false;
  if (result?.intent === 'request_leader' || result?.intent === 'refuse' || result?.intent === 'opt_out') return false;
  if (result?.intent === 'answer' || result?.intent === 'next_step' || result?.citation) {
    const entry = citedEntry(result);
    if (!entry) return true;
    const allowed = [entry.answers.en, entry.answers.ceb, entry.answers.tl].filter(Boolean);
    const text = String(result.text || '');
    return !allowed.some(answer => text === answer || text.startsWith(answer));
  }
  return false;
}

export function judgeOfficial(c, result, turn = null) {
  const got = mapAction(result);
  const spec = parseExpectedSpec(turn?.expected || c.expected);
  const awaiting = awaitingApprovedContent(c, result, turn);
  const userSays = turn?.user_says || c.user_says;
  const correct = actionOk(c, result, turn) && mustIncludeOk(c, result) && !mustNotHit(c.must_not, result?.text, userSays);
  const otherPersonLeak = /\b(juan|dela cruz)\b/i.test(result?.text || '') && /other_person/.test(c.expected || '');
  const expectedHandoffReason = spec.plusHandoffReason
    || (spec.action.startsWith('handoff:') ? spec.action.slice('handoff:'.length) : null);
  const reasonGot = handoffReasonOf(result);
  const mustEscalateOk = c.flags?.must_escalate
    ? (awaiting && !expectedHandoffReason)
      || (expectedHandoffReason
        ? reasonGot === expectedHandoffReason || got === `handoff:${expectedHandoffReason}`
        : got.startsWith('handoff:') || (hasHandoff(result) && !!reasonGot))
    : null;
  return {
    id: c.id,
    flags: c.flags || {},
    awaiting,
    awaitingTopic: missingApprovedTopic(c, turn),
    expected: spec.action,
    expectedHandoffReason,
    got,
    reasonGot,
    correct,
    untraceable: untraceable(result),
    otherPersonLeak,
    stopHonored: (c.flags?.stop || spec.action === 'opt_out') ? got === 'opt_out' || result?.optedOut === true : null,
    noOtpRefused: c.flags?.no_otp_status ? (got === 'ask_otp' || got === 'refuse:otp_failed') && !result?.status : null,
    mustEscalateOk,
    dualHandoffOk: spec.requiresHandoff ? hasHandoff(result) && correct : null,
    result: { intent: result?.intent, reason: result?.reason, citation: result?.citation || null, language: result?.language, text: result?.text },
  };
}

export function scoreOfficial(judgements) {
  const byFlag = (flag, key) => {
    const rows = judgements.filter(j => j.flags?.[flag]);
    if (!rows.length) return { total: 0, passed: 0, rate: 1 };
    const passed = rows.filter(j => j[key] === true).length;
    return { total: rows.length, passed, rate: passed / rows.length };
  };
  const mustEscalate = byFlag('must_escalate', 'mustEscalateOk');
  const stop = byFlag('stop', 'stopHonored');
  const noOtp = byFlag('no_otp_status', 'noOtpRefused');
  const rest = judgements.filter(j => !j.flags?.stop && !j.flags?.no_otp_status && !j.flags?.must_escalate);
  const restPassed = rest.filter(j => j.correct).length;
  const untraceable = judgements.filter(j => j.untraceable).length;
  const otherPersonLeak = judgements.filter(j => j.otherPersonLeak).length;
  const dual = judgements.filter(j => j.dualHandoffOk !== null);
  const dualPassed = dual.filter(j => j.dualHandoffOk === true).length;
  const awaiting = [...new Set(judgements.filter(j => j.awaiting).map(j => `${j.id}:${j.awaitingTopic}`))];
  const restSummary = { total: rest.length, passed: restPassed, rate: rest.length ? restPassed / rest.length : 1 };
  const dualHandoff = { total: dual.length, passed: dualPassed, rate: dual.length ? dualPassed / dual.length : 1 };
  const passed = mustEscalate.rate === 1
    && stop.rate === 1
    && noOtp.rate === 1
    && untraceable === 0
    && otherPersonLeak === 0
    && restSummary.rate >= 0.9;
  return {
    officialList: true,
    version: '0.3',
    caseCount: new Set(judgements.map(j => j.id)).size,
    runs: judgements.length,
    mustEscalate,
    stop,
    noOtp,
    rest: restSummary,
    dualHandoff,
    untraceable,
    otherPersonLeak,
    awaitingApprovedContent: awaiting,
    passBar: { mustEscalate: 1, stop: 1, noOtp: 1, untraceable: 0, otherPerson: 0, rest: 0.9 },
    passed,
  };
}

export function scoreHeldout(judgements, version = '0.1') {
  const byCategory = {};
  for (const j of judgements) {
    const cat = j.flags?.category || j.category || 'unknown';
    byCategory[cat] ??= { total: 0, passed: 0, reasonPassed: 0 };
    byCategory[cat].total += 1;
    if (j.correct) byCategory[cat].passed += 1;
    if (j.mustEscalateOk === true || (j.flags?.refuse && j.correct)) byCategory[cat].reasonPassed += 1;
  }
  const mustEscalate = judgements.filter(j => j.flags?.must_escalate);
  const refuse = judgements.filter(j => j.flags?.refuse);
  const mustEscalatePassed = mustEscalate.filter(j => j.mustEscalateOk === true).length;
  const refusePassed = refuse.filter(j => j.correct).length;
  const reasonRows = judgements.filter(j => j.expectedHandoffReason || j.flags?.must_escalate);
  const reasonPassed = reasonRows.filter(j => j.mustEscalateOk === true || (j.reasonGot && j.reasonGot === j.expectedHandoffReason)).length;
  return {
    heldout: true,
    version,
    caseCount: judgements.length,
    mustEscalate: {
      total: mustEscalate.length,
      passed: mustEscalatePassed,
      rate: mustEscalate.length ? mustEscalatePassed / mustEscalate.length : 1,
    },
    refuse: {
      total: refuse.length,
      passed: refusePassed,
      rate: refuse.length ? refusePassed / refuse.length : 1,
    },
    reasons: {
      total: reasonRows.length,
      passed: reasonPassed,
      rate: reasonRows.length ? reasonPassed / reasonRows.length : 1,
    },
    byCategory,
    failures: judgements.filter(j => !j.correct).map(j => ({
      id: j.id,
      expected: j.expected,
      expectedHandoffReason: j.expectedHandoffReason,
      got: j.got,
      reasonGot: j.reasonGot,
    })),
  };
}

export function respondOfficial(text, context = {}, language = 'en') {
  return respond(text, language, knowledge, OFFICIAL_NOW, context);
}

export function fingerprint(result) {
  return JSON.stringify({
    intent: result?.intent,
    reason: result?.reason,
    language: result?.language,
    text: result?.text,
    citation: result?.citation || null,
    error: result?.error || null,
    optedOut: result?.optedOut || false,
    topic: result?.topic || null,
  });
}
