import { describe, it, expect, beforeEach } from 'vitest';
import {
  adapterAllows,
  adapterAllowsTopic,
  parseProgram,
  programAdapter,
  lookupProgramStatus,
  programFromContext,
  requireProgram,
  resolveStoredProgram,
  PROGRAMS,
  DEFAULT_VISITOR_PROGRAM,
  LEAST_PRIVILEGED_PROGRAM,
} from './programs.mjs';
import { createSyntheticProgramSource, programSource, resetProgramSource } from './program-source.mjs';
import { GIA_TOOLS } from './engine.mjs';
import { respond } from './engine.mjs';

describe('program adapters', () => {
  beforeEach(() => resetProgramSource());

  it('parses known programs and treats empty or unknown as invalid', () => {
    expect(parseProgram(undefined)).toBeNull();
    expect(parseProgram(null)).toBeNull();
    expect(parseProgram('')).toBeNull();
    expect(parseProgram('   ')).toBeNull();
    expect(parseProgram('intern')).toBe('intern');
    expect(parseProgram(' intern ')).toBe('intern');
    expect(parseProgram('ra-spike')).toBe('ra');
    expect(parseProgram('RA-SPIKE')).toBeNull();
    expect(parseProgram('Recruit')).toBeNull();
    expect(parseProgram('portal')).toBeNull();
    expect(parseProgram('admin')).toBeNull();
    expect(parseProgram(['recruit'])).toBeNull();
    expect(parseProgram([['recruit']])).toBeNull();
    expect(parseProgram({})).toBeNull();
    expect(parseProgram(0)).toBeNull();
    expect(parseProgram(true)).toBeNull();
    expect(parseProgram({ toString() { return 'recruit'; } })).toBeNull();
    expect(PROGRAMS).toEqual(['recruit', 'intern', 'ra']);
    expect(DEFAULT_VISITOR_PROGRAM).toBe('recruit');
    expect(LEAST_PRIVILEGED_PROGRAM).toBe('intern');
  });

  it('defaults to recruit only when the program field is absent', () => {
    expect(requireProgram({})).toBe('recruit');
    expect(requireProgram({ action: 'list_fep_sessions' })).toBe('recruit');
    expect(requireProgram({ program: undefined })).toBe('recruit');
    expect(() => requireProgram({ program: null })).toThrow('invalid_program');
    expect(() => requireProgram({ program: '' })).toThrow('invalid_program');
    expect(() => requireProgram({ program: 'admin' })).toThrow('invalid_program');
    expect(requireProgram({ program: 'intern' })).toBe('intern');
  });

  it('does not fail open to recruit from a tampered body or cookie', () => {
    expect(resolveStoredProgram({ hasBodyProgram: false, cookieProgram: null })).toEqual({ program: 'recruit' });
    expect(resolveStoredProgram({ hasBodyProgram: true, bodyProgram: null, cookieProgram: 'intern' })).toEqual({ error: 'invalid_program' });
    expect(resolveStoredProgram({ hasBodyProgram: true, bodyProgram: '', cookieProgram: 'intern' })).toEqual({ error: 'invalid_program' });
    expect(resolveStoredProgram({ hasBodyProgram: false, cookieProgram: '' })).toEqual({ error: 'invalid_program' });
    expect(resolveStoredProgram({ hasBodyProgram: false, cookieProgram: 'admin' })).toEqual({ error: 'invalid_program' });
    expect(resolveStoredProgram({ hasBodyProgram: false, cookieProgram: 'intern' })).toEqual({ program: 'intern' });
    expect(resolveStoredProgram({ hasBodyProgram: true, bodyProgram: 'intern', cookieProgram: 'recruit' })).toEqual({ program: 'intern', persist: true });
    expect(programFromContext({})).toBe('recruit');
    expect(programFromContext({ program: null })).toBe('intern');
    expect(programFromContext({ program: '' })).toBe('intern');
    expect(programFromContext({ program: 'admin' })).toBe('intern');
    for (const program of [['recruit'], [['recruit']], {}, 0, true]) {
      expect(parseProgram(program)).toBeNull();
      expect(resolveStoredProgram({ hasBodyProgram: true, bodyProgram: program, cookieProgram: 'intern' })).toEqual({ error: 'invalid_program' });
      expect(programFromContext({ program })).toBe('intern');
      expect(() => requireProgram({ program })).toThrow('invalid_program');
    }
  });

  it('keeps all five GIA tools on recruit and withholds FEP tools from intern/RA', () => {
    expect(programAdapter('recruit').tools).toEqual([...GIA_TOOLS]);
    expect(adapterAllows('intern', 'book_fep')).toBe(false);
    expect(adapterAllows('ra', 'list_fep_sessions')).toBe(false);
    expect(adapterAllows('intern', 'get_my_status')).toBe(true);
    expect(adapterAllows('ra', 'opt_out')).toBe(true);
    expect(adapterAllows('intern', 'consent')).toBe(true);
    expect(adapterAllowsTopic('recruit', 'fep')).toBe(true);
    expect(adapterAllowsTopic('intern', 'fep')).toBe(false);
    expect(adapterAllowsTopic('intern', 'literacy')).toBe(false);
    expect(adapterAllowsTopic('ra', 'fep')).toBe(false);
  });

  it('looks up intern status from the synthetic source without a portal', async () => {
    programSource().seed('intern', 'sess-1', { stage: 'explore' });
    const status = await lookupProgramStatus('intern', 'sess-1');
    expect(status).toEqual({
      program: 'intern',
      programSource: 'synthetic',
      programLinked: true,
      programStage: 'explore',
    });
    expect(JSON.stringify(status)).not.toMatch(/portal|https?:\/\//i);
  });

  it('lets a different source implementation be swapped in', async () => {
    const alt = createSyntheticProgramSource({ 'ra:alt': { stage: 'develop', cohort: 'synthetic-cohort' } });
    const row = await alt.lookup({ program: 'ra', identity: 'alt' });
    expect(row.linked).toBe(true);
    expect(row.stage).toBe('develop');
    expect(row.source).toBe('synthetic');
    expect(alt.id).toBe('synthetic');
  });

  it('refuses a source payload that hardwires a portal', () => {
    expect(() => createSyntheticProgramSource().seed('intern', 'x', { stage: 'https://portal.1cma.online/app' })).toThrow('portal_hardwire_forbidden');
  });

  it('refuses a non-synthetic GIA_PROGRAM_SOURCE', () => {
    const previous = process.env.GIA_PROGRAM_SOURCE;
    process.env.GIA_PROGRAM_SOURCE = 'portal';
    try {
      expect(() => programSource()).toThrow('unsupported_program_source');
    } finally {
      if (previous == null) delete process.env.GIA_PROGRAM_SOURCE;
      else process.env.GIA_PROGRAM_SOURCE = previous;
    }
  });

  it('engine routes intern FEP listing as wrong_program and still escalates entitlements', () => {
    const listed = respond('Show FEP sessions', 'en', undefined, undefined, { program: 'intern' });
    expect(listed.intent).toBe('request_leader');
    expect(listed.reason).toBe('wrong_program');
    expect(listed.text).not.toMatch(/portal\.1cma/i);
    const codes = respond('Create an L1 access code for me', 'en', undefined, undefined, { program: 'intern' });
    expect(codes.reason).toBe('boundary_codes');
    const recruit = respond('Show FEP sessions', 'en', undefined, undefined, { program: 'recruit' });
    expect(recruit.intent).toBe('list_fep_sessions');
  });

  it('does not serve recruit FAQ to intern/RA and fail-closes tampered program context', () => {
    const internFep = respond('what is FEP', 'en', undefined, undefined, { program: 'intern' });
    expect(internFep.intent).toBe('request_leader');
    expect(internFep.reason).toBe('route_spike_interns');
    expect(internFep).not.toHaveProperty('citation');
    const internExplore = respond('Explore Free Financial Entrepreneurship Preview', 'en', undefined, undefined, { program: 'intern' });
    expect(internExplore.intent).toBe('request_leader');
    expect(internExplore.reason).toBe('route_spike_interns');
    const internLit = respond('financial literacy', 'en', undefined, undefined, { program: 'intern' });
    expect(internLit.intent).toBe('request_leader');
    expect(internLit.reason).toBe('route_spike_interns');
    const raFep = respond('what is FEP', 'en', undefined, undefined, { program: 'ra' });
    expect(raFep.reason).toBe('route_ra_spike');
    const tampered = respond('Show FEP sessions', 'en', undefined, undefined, { program: null });
    expect(tampered.intent).toBe('request_leader');
    expect(tampered.reason).toBe('wrong_program');
    const empty = respond('Show FEP sessions', 'en', undefined, undefined, { program: '' });
    expect(empty.reason).toBe('wrong_program');
    for (const program of [['recruit'], [['recruit']], {}, 0, true]) {
      const listed = respond('Show FEP sessions', 'en', undefined, undefined, { program });
      expect(listed.intent).toBe('request_leader');
      expect(listed.reason).toBe('wrong_program');
      expect(listed).not.toHaveProperty('citation');
      const faq = respond('what is FEP', 'en', undefined, undefined, { program });
      expect(faq.intent).toBe('request_leader');
      expect(faq).not.toHaveProperty('citation');
      expect(String(faq.text || '')).not.toMatch(/KP-FEP-01/);
    }
  });
});
