import { describe, it, expect } from 'vitest';
import { DOMAINS, MVP01_ACTIVE_DOMAINS, isActiveDomain, isServableEntry, topicDomain } from './domains.mjs';
import { canReadDomain, canUseTool, visitorRole, ROLES } from './capabilities.mjs';
import { knowledge } from './engine.mjs';
import { isApproved } from './knowledge-import.mjs';

const now = new Date('2026-11-12T12:00:00Z');

describe('MVP 01 knowledge domains and capabilities', () => {
  it('activates recruitment, financial-literacy, fep, and documents', () => {
    expect([...MVP01_ACTIVE_DOMAINS].sort()).toEqual(['documents', 'fep', 'financial-literacy', 'recruitment', 'safety']);
    expect(isActiveDomain('interns')).toBe(false);
    expect(isActiveDomain('ra-spike')).toBe(false);
    expect(DOMAINS.interns.status).toBe('stub');
    expect(topicDomain('literacy')).toBe('financial-literacy');
    expect(topicDomain('licensing_documents')).toBe('documents');
  });

  it('keeps the approved LIT/FEP/DOCS pack and leaves intern/RA stubs unserved', () => {
    expect(knowledge.filter(e => isApproved(e, now)).map(e => e.id).sort()).toEqual([
      'KP-DOCS-01', 'KP-DOCS-02', 'KP-DOCS-03', 'KP-DOCS-04', 'KP-DOCS-05', 'KP-DOCS-06', 'KP-FEP-01', 'KP-LIT-01', 'KP-SAFETY-01',
    ]);
    expect(knowledge.find(e => e.id === 'KP-LIT-01')?.domain).toBe('financial-literacy');
    expect(knowledge.find(e => e.id === 'KP-REC-01')?.status).toBe('approved');
    expect(isApproved(knowledge.find(e => e.id === 'KP-REC-01'), now)).toBe(false);
    expect(isApproved(knowledge.find(e => e.id === 'KP-REC-01'), new Date('2026-11-13T12:00:00Z'))).toBe(false);
    expect(isApproved(knowledge.find(e => e.id === 'KP-REC-01'), new Date('2026-11-14T12:00:00Z'))).toBe(true);
    expect(knowledge.find(e => e.id === 'KP-INT-01')?.status).toBe('draft');
    expect(isServableEntry(knowledge.find(e => e.id === 'KP-DOCS-01'))).toBe(true);
  });

  it('maps visitor roles and never lets leader/admin bypass GIA chat limits', () => {
    expect(ROLES).toEqual(['prospect', 'candidate', 'intern', 'ra', 'leader', 'admin']);
    expect(visitorRole({ program: 'recruit' })).toBe('prospect');
    expect(visitorRole({ program: 'recruit', consented: true })).toBe('candidate');
    expect(visitorRole({ program: 'intern', consented: true })).toBe('intern');
    expect(canUseTool('intern', 'book_fep')).toBe(false);
    expect(canUseTool('admin', 'book_fep')).toBe(false);
    expect(canUseTool('leader', 'get_my_status')).toBe(false);
    expect(canUseTool('prospect', 'opt_out')).toBe(true);
    expect(canReadDomain('prospect', 'financial-literacy')).toBe(true);
    expect(canReadDomain('prospect', 'documents')).toBe(true);
    expect(canReadDomain('intern', 'fep')).toBe(false);
    expect(canReadDomain('intern', 'safety')).toBe(true);
    expect(canReadDomain('intern', 'interns')).toBe(false);
    expect(canReadDomain('candidate', 'fep')).toBe(true);
    expect(canReadDomain('ra', 'financial-literacy')).toBe(false);
  });
});
