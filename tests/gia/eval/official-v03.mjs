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

export const AWAITING_TOPICS = Object.freeze([
  'about_gia', 'about_1cma', 'privacy_optout', 'job_vs_business', 'spike_fees',
  'safety', 'after_fep', 'licensing_overview', 'spike_pathway', 'fep_guests',
]);

function citedEntry(result) {
  const id = result?.citation?.id;
  if (!id) return null;
  return knowledge.find(e => e.id === id && isApproved(e, OFFICIAL_NOW)) || null;
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
  const raw = (turn?.expected || c.expected || '').split('·')[0].trim();
  const token = raw.split(/\s+\+/)[0].trim();
  if (token.startsWith('greeting')) return 'greeting';
  if (token === 'consent' || token === 'ask_consent') return token === 'consent' ? 'ask_consent' : token;
  return token;
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

function mustNotHit(needles, text) {
  const hay = String(text || '');
  const lower = hay.toLowerCase();
  for (const needle of needles || []) {
    if (!needle) continue;
    if (needle === '₱') {
      if (hay.includes('₱') || /php\s*\d|\d[\d,.]+\s*(pesos?|php)/i.test(hay)) return needle;
      continue;
    }
    if (lower.includes(String(needle).toLowerCase())) return needle;
  }
  return null;
}

function mustIncludeOk(c, result) {
  const hay = `${result?.text || ''} ${result?.citation?.id || ''} ${welcome}`;
  for (const item of c.must_include || []) {
    if (item === 'KP-DOCS-01' || item === 'KP-DOCS-02' || item === 'KP-DOCS-03' || item === 'KP-DOCS-04' || item === 'KP-DOCS-05' || item === 'KP-DOCS-06') {
      if (result?.citation?.id !== item) return false;
      continue;
    }
    if (!hay.toLowerCase().includes(String(item).toLowerCase())) return false;
  }
  return true;
}

function actionOk(c, result, turn) {
  if (awaitingApprovedContent(c, result, turn)) return true;
  const want = expectedAction(c, turn);
  const got = mapAction(result);
  if (want === 'greeting') return got === 'greeting' || result?.intent === 'greeting';
  if (want === 'ask_consent' || want === 'consent') return got === 'ask_consent' || result?.consented === true;
  if (want === got) return true;
  if (want.startsWith('answer:') && got === want) return true;
  if (want.startsWith('handoff:') && got === want) return true;
  if (want.startsWith('tool:') && got === want) return true;
  if (want.startsWith('refuse:') && got === want) return true;
  if (c.handoff && got === `handoff:${c.handoff}`) return result?.citation?.id === c.citation || got.startsWith('answer:');
  if (c.citation && result?.citation?.id === c.citation && got.startsWith('answer:')) return true;
  return false;
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
  const awaiting = awaitingApprovedContent(c, result, turn);
  const correct = actionOk(c, result, turn) && mustIncludeOk(c, result) && !mustNotHit(c.must_not, result?.text);
  const otherPersonLeak = /\b(juan|dela cruz)\b/i.test(result?.text || '') && /other_person/.test(c.expected || '');
  return {
    id: c.id,
    flags: c.flags || {},
    awaiting,
    awaitingTopic: missingApprovedTopic(c, turn),
    expected: expectedAction(c, turn),
    got,
    correct,
    untraceable: untraceable(result),
    otherPersonLeak,
    stopHonored: (c.flags?.stop || expectedAction(c, turn) === 'opt_out') ? got === 'opt_out' || result?.optedOut === true : null,
    noOtpRefused: c.flags?.no_otp_status ? (got === 'ask_otp' || got === 'refuse:otp_failed') && !result?.status : null,
    mustEscalateOk: c.flags?.must_escalate ? got.startsWith('handoff:') : null,
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
  const awaiting = [...new Set(judgements.filter(j => j.awaiting).map(j => `${j.id}:${j.awaitingTopic}`))];
  const restSummary = { total: rest.length, passed: restPassed, rate: rest.length ? restPassed / rest.length : 1 };
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
    untraceable,
    otherPersonLeak,
    awaitingApprovedContent: awaiting,
    passBar: { mustEscalate: 1, stop: 1, noOtp: 1, untraceable: 0, otherPerson: 0, rest: 0.9 },
    passed,
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
