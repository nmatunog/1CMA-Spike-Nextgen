export const invitations = Object.freeze({
  preview: 'Free Financial Entrepreneur Preview',
  literacy: 'Free Financial Literacy Sessions',
  pathway: 'Level Up',
});
export const audiences = ['professional', 'parent', 'student'];
export function validateCandidate(p) {
  const errors = {};
  if (!p.name?.trim() || p.name.trim().length > 100) errors.name = 'Enter a name between 1 and 100 characters.';
  if (!/^[^\s@]+@example\.(com|org|net)$/i.test(p.email ?? '')) errors.email = 'Use a synthetic address such as alex@example.com for this preview.';
  if (!invitations[p.invitation]) errors.invitation = 'Choose an invitation.';
  if (!audiences.includes(p.audience)) errors.audience = 'Choose the audience that best describes you.';
  if (p.consent !== true) errors.consent = 'Confirm that you are using fictional details for this demo.';
  if ((p.businessGoal !== undefined || (p.invitation === 'literacy' && p.enrollment)) && (!p.businessGoal?.trim() || p.businessGoal.trim().length < 3 || p.businessGoal.length > 500)) errors.businessGoal = 'Share a short goal (3–500 characters) for the SPIKE opening sessions.';
  if (p.enrollment) {
    const e = p.enrollment;
    if (!/^09\d{9}$/.test(e.mobile ?? '')) errors.mobile = 'Enter an 11-digit fictional mobile number, e.g. 09000000000.';
    if (!['virtual', 'cebu', 'discuss'].includes(e.contactMode)) errors.contactMode = 'Choose a preferred session format.';
    if (!e.availability?.trim() || e.availability.length > 100) errors.availability = 'Add your preferred days or times (up to 100 characters).';
    if (p.invitation === 'preview' && !['woman', 'man', 'nonbinary', 'self-describe', 'prefer-not'].includes(e.gender)) errors.gender = 'Choose an option, including Prefer not to say.';
    if (p.invitation === 'literacy') {
      if (!['single', 'married', 'separated', 'divorced', 'widowed', 'prefer-not'].includes(e.civilStatus)) errors.civilStatus = 'Choose a civil status, including Prefer not to say.';
      const birth = typeof e.dateOfBirth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.dateOfBirth) ? new Date(e.dateOfBirth + 'T00:00:00Z') : new Date(NaN);
      if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== e.dateOfBirth || e.dateOfBirth < '1900-01-01' || birth.getTime() > Date.now()) errors.dateOfBirth = 'Choose a valid fictional birth date in the past.';
      if (!e.address?.trim() || e.address.trim().length < 5 || e.address.length > 300) errors.address = 'Add a fictional address (5–300 characters).';
    }
    if (p.invitation === 'literacy' && !['budgeting', 'protection', 'planning', 'explore'].includes(e.topic)) errors.topic = 'Choose a literacy topic.';
    if (p.invitation === 'pathway') {
      if (!['woman', 'man', 'nonbinary'].includes(e.gender)) errors.pathwayGender = 'A complete gender selection is required for the 03 Level Up pathway.';
      if (!['single', 'married', 'separated', 'divorced', 'widowed'].includes(e.civilStatus)) errors.pathwayCivilStatus = 'A complete civil-status selection is required for the 03 Level Up pathway.';
      if (!e.occupation?.trim() || e.occupation.length > 100) errors.occupation = 'Add a fictional current role or background.';
      if (!['senior', 'college', 'graduate', 'postgraduate', 'other'].includes(e.education)) errors.education = 'Choose an education background.';
      if (!e.motivation?.trim() || e.motivation.trim().length < 10 || e.motivation.length > 1000) errors.motivation = 'Add 10–1,000 characters about your interest.';
      if (!['6-10', '10-20', '20plus', 'discuss'].includes(e.commitment)) errors.commitment = 'Choose your available development time.';
      if (!e.document?.provided || !['application/pdf', 'image/png', 'image/jpeg'].includes(e.document.type) || !(e.document.size > 0 && e.document.size <= 5 * 1024 * 1024)) errors.document = 'Choose a dummy PDF, PNG or JPEG up to 5 MB. Do not use a real ID.';
    }
  }
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
