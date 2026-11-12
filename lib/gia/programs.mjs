// Role-aware GIA program adapters (NEXO #32). Recruit, intern, and RA share
// STOP/OTP/escalation. Tools and status lookups are adapter-selected so a
// program source can be swapped without hardwiring a portal.
import { programSource } from './program-source.mjs';

export const PROGRAMS = Object.freeze(['recruit', 'intern', 'ra']);
/** New visitors with no body.program and no cookie. Never used for empty/unknown values. */
export const DEFAULT_VISITOR_PROGRAM = 'recruit';
/** Fail-closed adapter: no FEP tools. Tampered values must not become recruit. */
export const LEAST_PRIVILEGED_PROGRAM = 'intern';

const TOOLS = {
  recruit: Object.freeze(['list_fep_sessions', 'book_fep', 'request_leader', 'get_my_status', 'opt_out']),
  intern: Object.freeze(['get_my_status', 'request_leader', 'opt_out']),
  ra: Object.freeze(['get_my_status', 'request_leader', 'opt_out']),
};

const ADAPTERS = Object.freeze({
  recruit: Object.freeze({
    id: 'recruit',
    tools: TOOLS.recruit,
    knowledgeTopics: Object.freeze(['literacy', 'fep', 'licensing_documents', 'safety']),
    pathway: '1CMA recruitment (free literacy, free FEP, leader handoff)',
  }),
  intern: Object.freeze({
    id: 'intern',
    tools: TOOLS.intern,
    knowledgeTopics: Object.freeze(['safety']),
    pathway: 'SPIKE for Interns',
    escalateReason: 'route_spike_interns',
  }),
  ra: Object.freeze({
    id: 'ra',
    tools: TOOLS.ra,
    knowledgeTopics: Object.freeze(['safety']),
    pathway: 'RA-SPIKE',
    escalateReason: 'route_ra_spike',
  }),
});

function hasOwn(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Parse a program id. Only real strings are accepted — arrays, numbers,
 * booleans, and objects (including custom toString) are invalid. After trim,
 * the value must be an exact lowercase canonical id or known alias.
 */
export function parseProgram(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  if (v === 'recruit' || v === 'recruitment') return 'recruit';
  if (v === 'intern' || v === 'interns' || v === 'spike_interns' || v === 'spike-for-interns') return 'intern';
  if (v === 'ra' || v === 'ra-spike' || v === 'ra_spike') return 'ra';
  return null;
}

/**
 * Default to recruit only when the caller omitted the field (not when it is
 * present as null/empty/unknown). Explicit junk is invalid_program.
 */
export function requireProgram(input) {
  if (!hasOwn(input, 'program') || input.program === undefined) return DEFAULT_VISITOR_PROGRAM;
  const parsed = parseProgram(input.program);
  if (!parsed) throw new Error('invalid_program');
  return parsed;
}

/**
 * Engine context: omitted program stays the visitor default. An explicit
 * null/empty/unknown value fail-closes to the least-privileged adapter so
 * FEP tools never appear from tampering.
 */
export function programFromContext(context) {
  if (!hasOwn(context, 'program') || context.program === undefined) return DEFAULT_VISITOR_PROGRAM;
  return parseProgram(context.program) || LEAST_PRIVILEGED_PROGRAM;
}

/**
 * Cookie + body resolution. Recruit default only when both are absent.
 * Explicit null, empty, or unknown in body or cookie is invalid_program.
 * @param {{ hasBodyProgram?: boolean, bodyProgram?: unknown, cookieProgram?: unknown }} [input]
 * @returns {{ program: string, persist?: boolean } | { error: 'invalid_program' }}
 */
export function resolveStoredProgram(input = {}) {
  const { hasBodyProgram = false, bodyProgram, cookieProgram } = input;
  if (hasBodyProgram && bodyProgram !== undefined) {
    const parsed = parseProgram(bodyProgram);
    if (!parsed) return { error: 'invalid_program' };
    return { program: parsed, persist: true };
  }
  if (cookieProgram == null) return { program: DEFAULT_VISITOR_PROGRAM };
  const parsed = parseProgram(cookieProgram);
  if (!parsed) return { error: 'invalid_program' };
  return { program: parsed };
}

export function programAdapter(program) {
  if (typeof program === 'string' && ADAPTERS[program]) return ADAPTERS[program];
  const id = parseProgram(program);
  if (!id || !ADAPTERS[id]) throw new Error('invalid_program');
  return ADAPTERS[id];
}

export function adapterAllows(program, action) {
  if (action === 'consent' || action === 'opt_out') return true;
  return programAdapter(program).tools.includes(action);
}

export function adapterAllowsTopic(program, topic) {
  if (!topic) return false;
  return programAdapter(program).knowledgeTopics.includes(topic);
}

export async function lookupProgramStatus(program, identity) {
  const adapter = programAdapter(program);
  const row = await programSource().lookup({ program: adapter.id, identity });
  return {
    program: adapter.id,
    programSource: row.source,
    programLinked: row.linked,
    programStage: row.stage,
  };
}
