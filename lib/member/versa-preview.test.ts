import { describe, expect, it } from 'vitest';
import { parseVersaPreview, decodeVersaPreview, previewHost } from './versa-preview';
const fields = { mfn: 'Test Member', mln: 'Example', me: 'test.member@example.test', sfn: 'Test', sln: 'Sponsor', code: 'FREE-SYN00001' };
describe('Versa synthetic compatibility receiver', () => {
  it('preserves all six encoded fields and supports refresh cookie decoding', () => {
    const query = new URLSearchParams(fields);
    expect(parseVersaPreview(query)).toEqual(fields);
    expect(decodeVersaPreview(query.toString())).toEqual(fields);
  });
  it('rejects missing, duplicate, oversized, real identity and non-synthetic code input', () => {
    for (const key of Object.keys(fields)) {
      const query = new URLSearchParams(fields); query.delete(key);
      expect(parseVersaPreview(query)).toBeNull();
      const duplicate = new URLSearchParams(fields); duplicate.append(key, 'other');
      expect(parseVersaPreview(duplicate)).toBeNull();
    }
    for (const changes of ([{ me: 'member@real.example' }, { code: 'SP-1234656' }, { mfn: 'x'.repeat(121) }, { handoff: 'signed-flow' }] as Record<string, string>[])) {
      expect(parseVersaPreview(new URLSearchParams({ ...fields, ...changes }))).toBeNull();
    }
  });
  it('never enables the public production hostname', () => {
    expect(previewHost('nextgen-staging.nmatunog.workers.dev')).toBe(true);
    expect(previewHost('spike-asc.pages.dev')).toBe(false);
    expect(decodeVersaPreview(undefined)).toBeNull();
  });
});
