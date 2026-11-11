import { describe, it, expect, beforeEach } from 'vitest';
import { adapterAllows, parseProgram, programAdapter, lookupProgramStatus, PROGRAMS } from './programs.mjs';
import { createSyntheticProgramSource, programSource, resetProgramSource } from './program-source.mjs';
import { GIA_TOOLS } from './engine.mjs';
import { respond } from './engine.mjs';

describe('program adapters', () => {
  beforeEach(() => resetProgramSource());

  it('defaults empty to recruit and rejects unknown programs', () => {
    expect(parseProgram(undefined)).toBe('recruit');
    expect(parseProgram('')).toBe('recruit');
    expect(parseProgram('intern')).toBe('intern');
    expect(parseProgram('RA-SPIKE')).toBe('ra');
    expect(parseProgram('portal')).toBeNull();
    expect(PROGRAMS).toEqual(['recruit', 'intern', 'ra']);
  });

  it('keeps all five GIA tools on recruit and withholds FEP tools from intern/RA', () => {
    expect(programAdapter('recruit').tools).toEqual([...GIA_TOOLS]);
    expect(adapterAllows('intern', 'book_fep')).toBe(false);
    expect(adapterAllows('ra', 'list_fep_sessions')).toBe(false);
    expect(adapterAllows('intern', 'get_my_status')).toBe(true);
    expect(adapterAllows('ra', 'opt_out')).toBe(true);
    expect(adapterAllows('intern', 'consent')).toBe(true);
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
});
