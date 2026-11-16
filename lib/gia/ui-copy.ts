export const SPIKE_PREVIEW_PATH = '/spike-preview';
export const STAFF_POST_LOGIN_PATH = '/recruitment/command';

export const GIA_TITLE = 'GIA — Your 1CMA AI Guide';
export const GIA_SUBTITLE = 'GIYA Institute — The SPIKE Method';
export const GIA_PILOT_BADGE = '1CMA · Controlled synthetic-data pilot';
export const GIA_DISCLAIMER =
  'Learning does not authorize you to sell insurance or give insurance advice.';
export const GIA_SYSTEM_NOTE =
  "GIA is a role-aware guide. Program status comes from a local adapter. It doesn't open a learning portal or change entitlements.";
export const GIA_NOTICE_PRIVACY =
  'Read the privacy notice before sharing information. We save a contact only with your consent. Please don\'t send IDs or documents. Reply STOP anytime to opt out.';

export const LITERACY_INVITE = 'Join Free Financial Literacy';
export const FEP_INVITE = 'Explore Free Financial Entrepreneurship Preview';
export const LEADER_INVITE = 'Talk to a 1CMA Leader';
export const NEXT_STEP_INVITE = 'What should I do next?';
export const INTERN_INVITE = 'Tell me about SPIKE for Interns';

export type GiaProgram = 'recruit' | 'intern' | 'ra';

/** Visitor-goal chips. Labels are UI only; `text` is the approved engine line. */
export const GIA_JTBD = [
  { label: 'I want to learn money basics', text: LITERACY_INVITE, program: 'recruit' as const, recruitOnly: true },
  { label: 'I want to explore a business path', text: FEP_INVITE, program: 'recruit' as const, recruitOnly: true },
  { label: "I'm a student / intern", text: INTERN_INVITE, program: 'intern' as const, recruitOnly: false },
  { label: 'Talk to a 1CMA leader', text: LEADER_INVITE, recruitOnly: false },
] as const;

export const GIA_QUICK_REPLIES_RECRUIT = [
  LITERACY_INVITE,
  FEP_INVITE,
  NEXT_STEP_INVITE,
  LEADER_INVITE,
] as const;

export const GIA_QUICK_REPLIES_OTHER = [LEADER_INVITE] as const;

export function resolveGiaPrompt(input: string): { text: string; program?: GiaProgram } {
  const hit = GIA_JTBD.find((item) => item.label === input || item.text === input);
  if (!hit) return { text: input };
  return 'program' in hit && hit.program ? { text: hit.text, program: hit.program } : { text: hit.text };
}

export function visibleJtbd(program: GiaProgram) {
  return GIA_JTBD.filter((item) => !item.recruitOnly || program === 'recruit');
}

export const GIA_CONSENT_TAG = 'Synthetic details only';
export const GIA_CONSENT_TITLE = 'Save a contact for booking or leader follow-up';
/** Approved consent fine print (keep; Pixie wording was a guess). */
export const GIA_CONSENT_FINE =
  'Use synthetic details only. Your name and email will be shared with authorized 1CMA staff for recruitment, booking and follow-up. STOP stops future contact. Do not send IDs or documents. Chat uploads are discarded.';
/** Approved checkbox copy. */
export const GIA_CONSENT_CHECKBOX =
  'I have read the privacy notice and consent to storing these details for recruitment, booking and follow-up.';
export const GIA_CONSENT_SAVE = 'Save consent and contact';

export const GIA_FOOTER_LINE2_PREFIX = "Reply STOP anytime to opt out · Don't send IDs or documents · ";
