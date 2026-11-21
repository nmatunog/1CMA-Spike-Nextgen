import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseVersaPreview, decodeVersaPreview, previewHost } from './versa-preview';
beforeEach(()=>vi.stubEnv('VERSA_GET_STAGING_ENABLED','true'));
afterEach(()=>vi.unstubAllEnvs());
const fields = { mfn: 'Test Member', mln: 'Example', me: 'test.member@example.test', sfn: 'Test', sln: 'Sponsor', code: 'FREE-SYN00001' };
describe('Versa unverified display receiver', () => {
  it('preserves all six encoded fields and supports refresh cookie decoding', () => {
    const query = new URLSearchParams(fields);
    expect(parseVersaPreview(query)).toEqual(fields);
    expect(decodeVersaPreview(query.toString())).toEqual(fields);
  });
  it('rejects missing, duplicate, unknown, oversized and unsafe control input', () => {
    for (const key of Object.keys(fields)) {
      const query = new URLSearchParams(fields); query.delete(key);
      expect(parseVersaPreview(query)).toBeNull();
      const duplicate = new URLSearchParams(fields); duplicate.append(key, 'other');
      expect(parseVersaPreview(duplicate)).toBeNull();
    }
    for (const changes of ([{ mfn: 'x'.repeat(81) },{ me: 'x'.repeat(121) },{ code: 'x'.repeat(33) }, { handoff: 'signed-flow' },{ mfn:'bad\nname' },{ sln:'bad\u202ename' },{ mfn:'bad\ufffdname' }] as Record<string, string>[])) {
      expect(parseVersaPreview(new URLSearchParams({ ...fields, ...changes }))).toBeNull();
    }
  });
  it('never enables the public production hostname', () => {
    expect(previewHost('nextgen-staging.nmatunog.workers.dev')).toBe(true);
    expect(previewHost('spike-asc.pages.dev')).toBe(false);
    expect(decodeVersaPreview(undefined)).toBeNull();
  });
});

it('fails closed when the staging preview flag is absent',()=>{vi.stubEnv('VERSA_GET_STAGING_ENABLED','');expect(previewHost('nextgen-staging.nmatunog.workers.dev')).toBe(false);});

it.each([
 ['dennis@hismail.example','12345678'],['dennis@example2.test','NBM-12345'],
 ['not-an-email','any code format'],['x','!@#$%^&*()'],
])('accepts unrestricted display formats (case %#)',(me,code)=>{
 expect(parseVersaPreview(new URLSearchParams({...fields,me,code}))).toEqual({...fields,me,code});
});

it('ignores only known tracking keys and excludes them from stored context',()=>{
 const p=new URLSearchParams({...fields,fbclid:'ignored',utm_source:'fb',utm_campaign:'demo'});
 expect(parseVersaPreview(p)).toEqual(fields);
 p.set('unknown','no');expect(parseVersaPreview(p)).toBeNull();
});
