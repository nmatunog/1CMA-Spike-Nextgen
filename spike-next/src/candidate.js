export const invitations = Object.freeze({
  preview: 'Free Financial Entrepreneur Preview',
  literacy: 'Free Financial Literacy Sessions',
  pathway: 'Level Up with SPIKE / RA-SPIKE',
});
export const audiences = ['professional', 'parent', 'student'];
export function validateCandidate(p) {
  const errors = {};
  if (!p.name?.trim() || p.name.trim().length > 100) errors.name = 'Enter a name between 1 and 100 characters.';
  if (!/^[^\s@]+@example\.(com|org|net)$/i.test(p.email ?? '')) errors.email = 'Use a synthetic address such as alex@example.com for this preview.';
  if (!invitations[p.invitation]) errors.invitation = 'Choose an invitation.';
  if (!audiences.includes(p.audience)) errors.audience = 'Choose the audience that best describes you.';
  if (p.consent !== true) errors.consent = 'Confirm that you are using fictional details for this demo.';
  return errors;
}
// Optional reflection, never a career suitability score or admissions decision.
export function reflect(answers) {
  if (!Array.isArray(answers) || answers.length !== 3 || answers.some(a => !['preview', 'literacy', 'pathway'].includes(a))) return null;
  const counts = { preview: 0, literacy: 0, pathway: 0 };
  answers.forEach(a => counts[a]++);
  const maximum = Math.max(...Object.values(counts));
  const winners = Object.keys(counts).filter(k => counts[k] === maximum);
  return { invitation: winners.length === 1 ? winners[0] : 'preview', tied: winners.length > 1 };
}
// Campaign codes only; never forward arbitrary query strings, URLs or referrers.
export function attribution(search) {
  const params = new URLSearchParams(search);
  return Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign'].flatMap(key => {
    const value = params.get(key);
    return value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? [[key, value]] : [];
  }));
}
export const fixtures = Object.freeze({
  accepted: Object.freeze({ status: 'accepted', mode: 'mock', acknowledgement: 'mock-sprint-01' }),
  rejected: Object.freeze({ status: 'rejected', mode: 'mock', code: 'DEMO_REJECTED' }),
  networkError: Object.freeze({ status: 'networkError', mode: 'mock', retryable: true }),
});
export function createMockAdapter({ scenario = 'accepted', delay = 350 } = {}) {
  if (!fixtures[scenario]) throw new TypeError('Unknown mock scenario');
  return async function submitCandidate(payload) {
    if (Object.keys(validateCandidate(payload)).length) return { status: 'rejected', mode: 'mock', code: 'INVALID_PAYLOAD' };
    await new Promise(resolve => setTimeout(resolve, delay));
    // No fetch, logging, cookies, storage, or retained payloads.
    return { ...fixtures[scenario] };
  };
}
export function responseMessage(result) {
  if (result?.status === 'accepted' && result.mode === 'mock' && typeof result.acknowledgement === 'string' && result.acknowledgement.trim()) {
    return { accepted: true, text: 'Demo acknowledged. No application was sent and no place is reserved.' };
  }
  if (result?.status === 'rejected') return { accepted: false, text: 'The demo request was rejected. Your details have not been sent. Review your choices and try again.' };
  return { accepted: false, text: 'The demo could not confirm a response. Your details have not been sent. Please try again.' };
}
