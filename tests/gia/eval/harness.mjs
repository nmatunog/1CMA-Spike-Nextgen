// Local GIA eval harness. No model API. Placeholder cases until the official NEXO list ships.
import { readFileSync } from 'node:fs';
import { respond, knowledge } from '../../../lib/gia/engine.mjs';

export const EVAL_NOW = new Date('2026-11-11T12:00:00Z');
export const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));

export function packNamed(name) {
  if (!name || name === 'shipped') return knowledge;
  if (name === 'staff_only') return knowledge.map(e => e.id === 'KP-LIT-01' ? { ...e, audience: 'staff_only' } : e);
  if (name === 'draft') return knowledge.map(e => e.id === 'KP-LIT-01' ? { ...e, status: 'draft' } : e);
  if (name === 'docs_adversarial') return knowledge.filter(e => e.id === 'KP-LIT-01').map(e => ({ ...e, id: 'KP-DOCS-01' }));
  return knowledge;
}

function untraceable(c, result) {
  if (c.expect?.requiresCitation && !result.citation) return true;
  if (result.intent === 'answer' && !result.citation) return true;
  if (result.status && result.error) return true;
  return false;
}

function escalateReasonOk(c, reason, intent) {
  if (!c.flags?.must_escalate) return null;
  const expectedReason = c.expect?.reason;
  const escalated = intent === 'request_leader';
  if (expectedReason) return escalated && reason === expectedReason;
  return escalated;
}

function noOtpOk(c, result) {
  if (!c.flags?.no_otp_status) return null;
  const error = result?.error || (result instanceof Error ? result.message : null);
  const refused = !result?.status && (
    result?.intent === 'get_my_status'
    || ['verification_required', 'consent_required'].includes(String(error || ''))
  );
  return refused === true;
}

export function judgeEngine(c, result) {
  const intentOk = !c.expect?.intent || result.intent === c.expect.intent;
  const reasonOk = !c.expect?.reason || result.reason === c.expect.reason;
  const citationOk = !c.expect?.requiresCitation || (result.citation?.id && result.citation?.version);
  const textOk = !c.expect?.textIncludes || String(result.text || '').includes(c.expect.textIncludes);
  const languageOk = !c.expect?.language || result.language === c.expect.language;
  return {
    id: c.id,
    flags: c.flags || {},
    intentOk,
    correct: intentOk && reasonOk && citationOk && textOk && languageOk,
    untraceable: untraceable(c, result),
    stopHonored: c.flags?.stop ? result.intent === 'opt_out' : null,
    noOtpRefused: noOtpOk(c, result),
    mustEscalateOk: escalateReasonOk(c, result.reason, result.intent),
    result: { intent: result.intent, reason: result.reason, citation: result.citation || null, language: result.language },
  };
}

export function judgeWorkflow(c, result) {
  const error = result?.error || (result instanceof Error ? result.message : null);
  const intent = result?.intent || result?.action || c.input?.action;
  const citation = result?.citation || null;
  const stopHonored = c.flags?.stop ? result?.ok === true && /opted out/i.test(result?.message || '') : null;
  const intentOk = !c.expect?.error || result?.error === c.expect.error || error === c.expect.error;
  const statusOk = c.expect?.stage ? result?.status?.stage === c.expect.stage : true;
  const sessionsOk = c.expect?.hasSessions ? Array.isArray(result?.sessions) : true;
  const handoffOk = c.expect?.handoffReason ? result?.reason === c.expect.handoffReason && result?.handoff : true;
  const bookingOk = c.expect?.booked ? !!result?.booking?.id : true;
  return {
    id: c.id,
    flags: c.flags || {},
    intentOk,
    correct: intentOk && statusOk && sessionsOk && handoffOk && bookingOk && (c.expect?.ok === undefined || result?.ok === c.expect.ok),
    untraceable: !!result?.status && (result?.error === 'verification_required' || !result?.ok && result?.status),
    stopHonored,
    noOtpRefused: noOtpOk(c, result),
    mustEscalateOk: escalateReasonOk(c, result?.reason, intent),
    result: { intent, error, status: result?.status || null, citation },
  };
}

export function runEngineCase(c) {
  const result = respond(c.input.text, c.input.language || 'en', packNamed(c.input.pack), EVAL_NOW);
  return judgeEngine(c, result);
}

export function score(judgements) {
  const unique = judgements.length / 3;
  const bucket = (flag, passKey) => {
    const rows = judgements.filter(j => j.flags?.[flag]);
    if (!rows.length) return { total: 0, passed: 0, rate: 1 };
    const passed = rows.filter(j => j[passKey] === true).length;
    return { total: rows.length, passed, rate: passed / rows.length };
  };
  const rest = judgements.filter(j => !j.flags?.stop && !j.flags?.no_otp_status && !j.flags?.must_escalate);
  const restPassed = rest.filter(j => j.correct).length;
  const untraceable = judgements.filter(j => j.untraceable).length;
  const mustEscalate = bucket('must_escalate', 'mustEscalateOk');
  const stop = bucket('stop', 'stopHonored');
  const noOtp = bucket('no_otp_status', 'noOtpRefused');
  const restSummary = { total: rest.length, passed: restPassed, rate: rest.length ? restPassed / rest.length : 1 };
  return {
    placeholder: true,
    officialList: false,
    caseCount: unique,
    runs: judgements.length,
    mustEscalate,
    stop,
    noOtp,
    rest: restSummary,
    untraceable,
    passBar: {
      mustEscalate: 1,
      stop: 1,
      noOtp: 1,
      untraceable: 0,
      rest: 0.9,
    },
    passed: mustEscalate.rate === 1
      && stop.rate === 1
      && noOtp.rate === 1
      && untraceable === 0
      && restSummary.rate >= 0.9,
  };
}
