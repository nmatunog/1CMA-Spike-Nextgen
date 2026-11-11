// Role-aware GIA program adapters (NEXO #32). Recruit, intern, and RA share
// STOP/OTP/escalation. Tools and status lookups are adapter-selected so a
// program source can be swapped without hardwiring a portal.
import { programSource } from './program-source.mjs';

export const PROGRAMS = Object.freeze(['recruit', 'intern', 'ra']);

const TOOLS = {
  recruit: Object.freeze(['list_fep_sessions', 'book_fep', 'request_leader', 'get_my_status', 'opt_out']),
  intern: Object.freeze(['get_my_status', 'request_leader', 'opt_out']),
  ra: Object.freeze(['get_my_status', 'request_leader', 'opt_out']),
};

const ADAPTERS = Object.freeze({
  recruit: Object.freeze({
    id: 'recruit',
    tools: TOOLS.recruit,
    knowledgeTopics: Object.freeze(['literacy', 'fep']),
    pathway: '1CMA recruitment (free literacy, free FEP, leader handoff)',
  }),
  intern: Object.freeze({
    id: 'intern',
    tools: TOOLS.intern,
    knowledgeTopics: Object.freeze([]),
    pathway: 'SPIKE for Interns',
    escalateReason: 'route_spike_interns',
  }),
  ra: Object.freeze({
    id: 'ra',
    tools: TOOLS.ra,
    knowledgeTopics: Object.freeze([]),
    pathway: 'RA-SPIKE',
    escalateReason: 'route_ra_spike',
  }),
});

export function parseProgram(value) {
  if (value == null || value === '') return 'recruit';
  const v = String(value).trim().toLowerCase();
  if (v === 'recruit' || v === 'recruitment') return 'recruit';
  if (v === 'intern' || v === 'interns' || v === 'spike_interns' || v === 'spike-for-interns') return 'intern';
  if (v === 'ra' || v === 'ra-spike' || v === 'ra_spike') return 'ra';
  return null;
}

export function programAdapter(program) {
  const id = parseProgram(program);
  if (!id) throw new Error('invalid_program');
  return ADAPTERS[id];
}

export function adapterAllows(program, action) {
  if (action === 'consent' || action === 'opt_out') return true;
  return programAdapter(program).tools.includes(action);
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
