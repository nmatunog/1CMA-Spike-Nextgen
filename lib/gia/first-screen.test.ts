import { describe, expect, it } from 'vitest';
import { FIRST_SCREEN_CHIPS, FIRST_SCREEN_GREETING, initialVisitorProgram, resolveVisitorPrompt } from './first-screen';
import { respond, knowledge } from './engine.mjs';

const now = new Date('2026-11-16T12:00:00Z');
describe('first-screen presentation routing', () => {
  it('has just three starter chips and a short AI disclosure greeting', () => {
    expect(FIRST_SCREEN_CHIPS).toEqual(['What is this?', 'Is it free?', 'How do I start?']);
    expect(FIRST_SCREEN_GREETING).toContain('AI guide');
    expect(FIRST_SCREEN_GREETING.split(/\s+/).length).toBeLessThan(25);
  });
  it.each(FIRST_SCREEN_CHIPS)('uses existing approved information for %s', label => {
    const reply = respond(resolveVisitorPrompt(label).text, 'en', knowledge, now);
    expect(reply.citation?.id).toBe(label === 'What is this?' ? 'KP-REC-09' : 'KP-LIT-01');
    expect(['answer', 'next_step']).toContain(reply.intent);
  });
  it.each(['intern', 'ra', 'recruit'] as const)('keeps the testing override %s', program => {
    expect(initialVisitorProgram(program)).toBe(program);
  });
  it.each([undefined, '', 'admin', ['ra']])('defaults new visitors to recruit for %j', value => {
    expect(initialVisitorProgram(value)).toBe('recruit');
  });
  it.each([
    ['A student internship', 'intern'], ["I'm a student", 'intern'], ['I am looking for an internship', 'intern'],
    ['Already an advisor', 'ra'], ["I'm already an AIA advisor", 'ra'], ['Exploring a career', 'recruit'],
  ])('selects an existing public path only for explicit self-identification: %s', (question, program) => {
    expect(resolveVisitorPrompt(question).program).toBe(program);
  });
  it.each(['What is an internship?', 'My friend is a student', 'I want to become an AIA advisor', 'I am not an advisor', 'Am I an advisor?', 'STOP', 'I want to die', 'My AIA password is sunshine'])('preserves arbitrary text and safety input: %s', question => {
    expect(resolveVisitorPrompt(question)).toEqual({ text: question });
  });
  it('preserves the existing student chip canonical prompt', () => {
    expect(resolveVisitorPrompt("I'm a student / intern")).toEqual({ text: 'Tell me about SPIKE for Interns', program: 'intern' });
  });
  it.each(['intern', 'ra'] as const)('does not grant FEP access on the %s presentation path', program => {
    expect(respond('Show FEP sessions', 'en', knowledge, now, { program })).toMatchObject({ intent: 'request_leader' });
  });
});
