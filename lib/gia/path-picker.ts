import { FEP_INVITE, INTERN_INVITE, LITERACY_INVITE, type GiaProgram } from './ui-copy';

export const AIA_JOIN_ASK = 'How do I join AIA / register?';
export const AIA_LEVELUP_ASK = 'Is AIA registration the same as paying for Level-Up?';
export const AIA_ADVISOR_ASK = 'What does an AIA advisor do?';
export const AIA_TRAINING_ASK = 'What training and support do I get?';
export const AIA_WHO_ASK = 'Who can apply to be an AIA advisor?';
export const AIA_STEPS_ASK = 'What does the AIA advisor path look like?';
export const AIA_FAQ_ASK = 'AIA advisor career FAQs';
export const AIA_CAREER_CHIPS = [AIA_ADVISOR_ASK, AIA_TRAINING_ASK, AIA_WHO_ASK, AIA_STEPS_ASK, AIA_FAQ_ASK, AIA_JOIN_ASK] as const;

export const PATH_GOALS = [
  { id: 'literacy', label: 'Learn money basics' },
  { id: 'business', label: 'Explore a business path' },
  { id: 'advisor', label: 'AIA advisor path' },
] as const;

export const PATH_SITUATIONS = [
  { id: 'student', label: 'Student / intern' },
  { id: 'working', label: 'Working professional' },
  { id: 'family', label: 'Family' },
] as const;

export const PATH_TIMES = [
  { id: 'intro', label: 'A short intro' },
  { id: 'session', label: 'A literacy session' },
  { id: 'recruiter', label: 'Talk with a recruiter' },
] as const;

export type PathGoal = (typeof PATH_GOALS)[number]['id'];
export type PathSituation = (typeof PATH_SITUATIONS)[number]['id'];
export type PathTime = (typeof PATH_TIMES)[number]['id'];
export type PathInvitation = 'literacy' | 'fep' | 'intern' | 'advisor';

export type PathRoute = {
  invitation: PathInvitation;
  prompt: string;
  program: GiaProgram;
  highlight: 'literacy' | 'fep' | 'advisor' | null;
};

/** Three taps, no storage, no PII. Student/intern never land on the AIA register step. */
export function routePathPicker(input: { goal: PathGoal; situation: PathSituation; time: PathTime }): PathRoute {
  if (input.situation === 'student') {
    return { invitation: 'intern', prompt: INTERN_INVITE, program: 'intern', highlight: null };
  }
  if (input.goal === 'advisor' || input.time === 'recruiter') {
    return { invitation: 'advisor', prompt: AIA_JOIN_ASK, program: 'recruit', highlight: 'advisor' };
  }
  if (input.goal === 'literacy' || input.time === 'session') {
    return { invitation: 'literacy', prompt: LITERACY_INVITE, program: 'recruit', highlight: 'literacy' };
  }
  return { invitation: 'fep', prompt: FEP_INVITE, program: 'recruit', highlight: 'fep' };
}
