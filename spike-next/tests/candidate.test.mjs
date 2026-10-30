import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, reflect, attribution, createMockAdapter, responseMessage } from '../src/candidate.js';
const payload = { name: 'Demo Person', email: 'demo@example.com', invitation: 'preview', audience: 'professional', consent: true };
test('requires synthetic details, an invitation, audience and explicit demo consent', () => {
  assert.deepEqual(validateCandidate(payload), {});
  assert.deepEqual(Object.keys(validateCandidate({})).sort(), ['audience', 'consent', 'email', 'invitation', 'name']);
  assert.ok(validateCandidate({ ...payload, email: 'real@company.ph' }).email);
  assert.ok(validateCandidate({ ...payload, name: ' ' }).name);
  assert.ok(validateCandidate({ ...payload, consent: 'true' }).consent);
});
test('mock scenarios acknowledge, reject and simulate offline without network or persistence', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network must never be used'); };
  try {
    for (const status of ['accepted', 'rejected', 'networkError']) {
      const result = await createMockAdapter({ scenario: status, delay: 0 })(payload);
      assert.equal(result.status, status);
      assert.equal(result.mode, 'mock');
      assert.equal(responseMessage(result).accepted, status === 'accepted');
    }
    assert.equal((await createMockAdapter({ delay: 0 })({ ...payload, consent: false })).status, 'rejected');
    assert.throws(() => createMockAdapter({ scenario: 'unexpected' }), TypeError);
  } finally { globalThis.fetch = originalFetch; }
});
test('never shows acknowledgement for missing, malformed, or backend-shaped success', () => {
  for (const result of [null, {}, { status: 'accepted' }, { status: 'accepted', mode: 'mock', acknowledgement: '' }, { status: 'accepted', mode: 'live', acknowledgement: '123' }, { ok: true }]) assert.equal(responseMessage(result).accepted, false);
});
test('reflection uses all answers and never invents a suitability score', () => {
  assert.equal(reflect(['literacy', 'literacy', 'pathway']).invitation, 'literacy');
  assert.equal(reflect(['pathway', 'pathway', 'literacy']).invitation, 'pathway');
  assert.deepEqual(reflect(['pathway', 'literacy', 'preview']), { invitation: 'preview', tied: true });
  assert.equal(reflect(['pathway']), null);
  assert.equal(reflect(['bad', 'bad', 'bad']), null);
});
test('attribution permits campaign codes only and excludes arbitrary URL/referrer content', () => {
  assert.deepEqual(attribution('?utm_source=demo&utm_medium=social&utm_campaign=cebu-01&email=demo@example.com'), { utm_source: 'demo', utm_medium: 'social', utm_campaign: 'cebu-01' });
  assert.deepEqual(attribution('?utm_source=alex@example.com&utm_medium=https://example.com&referrer=private'), {});
});
