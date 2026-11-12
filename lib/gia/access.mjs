export function staffRole(email, roster) {
  if (!email || typeof roster !== 'string') return null;
  try {
    const entry = JSON.parse(roster)[email.toLowerCase()];
    return ['admin', 'leader'].includes(entry) ? entry : null;
  } catch { return null; }
}
export function canAccess(actor, candidate) {
  return actor?.role === 'admin' || (actor?.role === 'leader' && candidate.assignedLeader === actor.email);
}
export function requireConsent(candidate) {
  if (!candidate || !candidate.consented || candidate.stage === 'opt_out') throw new Error('consent_required');
}
