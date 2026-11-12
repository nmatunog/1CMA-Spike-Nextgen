import { describe, it, expect } from 'vitest';
import { importKnowledge, isApproved, validateEntry, wordCount, isStaffOnly } from './knowledge-import.mjs';
import { entries } from './knowledge/pack.mjs';
import { knowledge } from './engine.mjs';

const now = new Date('2026-11-12T12:00:00Z');
const lit = entries.find(e => e.id === 'KP-LIT-01' && e.version === '0.2');

describe('knowledge pack import', () => {
  it('imports the shipping pack keyed by id and version', () => {
    const imported = importKnowledge(entries);
    expect(imported.byKey.get('KP-LIT-01::0.2').status).toBe('approved');
    expect(imported.byKey.get('KP-FEP-01::0.2').status).toBe('approved');
    for (const n of ['01','02','03','04','05','06']) {
      expect(imported.byKey.get(`KP-DOCS-${n}::0.1`).status).toBe('approved');
      expect(isApproved(imported.byKey.get(`KP-DOCS-${n}::0.1`), now)).toBe(true);
    }
    expect(knowledge.filter(e => isApproved(e, now)).map(e => e.id).sort()).toEqual([
      'KP-DOCS-01','KP-DOCS-02','KP-DOCS-03','KP-DOCS-04','KP-DOCS-05','KP-DOCS-06','KP-FEP-01','KP-LIT-01',
    ]);
  });
  it('rejects duplicate (id, version) keys', () => {
    expect(() => importKnowledge([lit, { ...lit }])).toThrow('knowledge_pack_invalid');
  });
  it('enforces the 90-word answer limit', () => {
    const long = { ...lit, answers: { en: Array.from({ length: 91 }, () => 'word').join(' ') } };
    expect(wordCount(long.answers.en)).toBe(91);
    expect(validateEntry(long)).toContain('answer_exceeds_90_words_en');
    expect(() => importKnowledge([long])).toThrow('knowledge_pack_invalid');
  });
  it('requires approval fields before an entry can be approved', () => {
    expect(validateEntry({ ...lit, approvedBy: '', approvedOn: '', approvalRef: '' }).sort()).toEqual(['missing_approvalRef','missing_approvedBy','missing_approvedOn']);
    expect(isApproved({ ...lit, approvedBy: 'Claude' }, now)).toBe(false);
  });
  it('never treats staff_only as servable even with approval metadata', () => {
    expect(isStaffOnly('staff_only')).toBe(true);
    expect(isStaffOnly('staff-only')).toBe(true);
    expect(isApproved({ ...lit, audience: 'staff_only' }, now)).toBe(false);
    expect(validateEntry({ ...lit, audience: 'staff_only' })).toContain('staff_only_cannot_be_approved_for_serving');
  });
  it('refuses to import non LIT/FEP/DOCS entries as approved', () => {
    const rec = { ...lit, id: 'KP-REC-01', version: '9.9' };
    expect(validateEntry(rec)).toContain('only_lit_fep_docs_may_be_approved');
    expect(isApproved(rec, now)).toBe(false);
  });
});
