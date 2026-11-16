import { resolveGiaPrompt, type GiaProgram } from './ui-copy';

export const FIRST_SCREEN_GREETING = "Hi, I'm GIA, your AI guide. What would you like to explore?";
export const FIRST_SCREEN_CHIPS = ['What is this?', 'Is it free?', 'How do I start?'] as const;
export const PATH_QUESTION = 'Are you exploring a career, a student internship, or already an advisor?';
export const PATH_CHOICES = ['Exploring a career', 'A student internship', 'Already an advisor'] as const;

export function initialVisitorProgram(value: unknown): GiaProgram {
  return value === 'intern' || value === 'ra' ? value : 'recruit';
}

/** UI hints select existing public adapters; they never verify a role or grant access. */
export function resolveVisitorPrompt(input: string): { text: string; program?: GiaProgram } {
  if (input === 'What is this?' || input === 'Is it free?') return { text: 'is financial literacy free' };
  if (input === 'How do I start?') return { text: 'What should I do next?' };
  if (input === 'Exploring a career') return { text: 'What should I do next?', program: 'recruit' };
  if (input === 'A student internship') return { text: 'Tell me about SPIKE for Interns', program: 'intern' };
  if (input === 'Already an advisor') return { text: 'What is RA-SPIKE?', program: 'ra' };
  const mapped = resolveGiaPrompt(input);
  if (mapped.program || mapped.text !== input) return mapped;
  // Only explicit first-person declarations change the presentation path.
  if (/^(?:i['’]m|i am) (?:a student(?:\s*[/.]\s*intern)?|(?:looking for|interested in) (?:a |an )?(?:student )?internship)[.!]?$/i.test(input.trim())) {
    return { text: input, program: 'intern' };
  }
  if (/^(?:i['’]m|i am) (?:already )?an? (?:aia )?(?:advisor|life planner)[.!]?$/i.test(input.trim())) {
    return { text: input, program: 'ra' };
  }
  return mapped;
}
