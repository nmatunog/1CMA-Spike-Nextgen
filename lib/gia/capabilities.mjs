// Permission / capability map for GIA visitor roles. Leader and admin exist
// so GIA never grants Command Center powers in chat. Visitor sessions only
// resolve to prospect, candidate, intern, or ra.
import { isActiveDomain } from './domains.mjs';

export const ROLES = Object.freeze(['prospect', 'candidate', 'intern', 'ra', 'leader', 'admin']);

const TOOLS = Object.freeze({
  prospect: Object.freeze(['consent', 'list_fep_sessions', 'book_fep', 'request_leader', 'get_my_status', 'opt_out']),
  candidate: Object.freeze(['consent', 'list_fep_sessions', 'book_fep', 'request_leader', 'get_my_status', 'opt_out']),
  intern: Object.freeze(['consent', 'get_my_status', 'request_leader', 'opt_out']),
  ra: Object.freeze(['consent', 'get_my_status', 'request_leader', 'opt_out']),
  leader: Object.freeze(['opt_out']),
  admin: Object.freeze(['opt_out']),
});

const DOMAINS = Object.freeze({
  prospect: Object.freeze(['recruitment', 'financial-literacy', 'fep', 'documents', 'safety']),
  candidate: Object.freeze(['recruitment', 'financial-literacy', 'fep', 'documents', 'safety']),
  intern: Object.freeze(['interns', 'safety']),
  ra: Object.freeze(['ra-spike', 'safety']),
  leader: Object.freeze(['recruitment', 'financial-literacy', 'fep', 'interns', 'ra-spike', 'safety']),
  admin: Object.freeze(['recruitment', 'financial-literacy', 'fep', 'interns', 'ra-spike', 'documents', 'safety']),
});

export function visitorRole({ program, consented } = {}) {
  if (program === 'intern') return 'intern';
  if (program === 'ra') return 'ra';
  if (consented) return 'candidate';
  return 'prospect';
}

export function canUseTool(role, action) {
  if (action === 'opt_out') return true;
  return (TOOLS[role] || []).includes(action);
}

export function canReadDomain(role, domain) {
  if (!isActiveDomain(domain) && role !== 'leader' && role !== 'admin') return false;
  return (DOMAINS[role] || []).includes(domain);
}

export function capabilityMap() {
  return { roles: ROLES, tools: TOOLS, domains: DOMAINS };
}
