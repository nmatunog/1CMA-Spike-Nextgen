import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCandidate, reflect, attribution, createMockAdapter, responseMessage } from '../src/candidate.js';
const payload = { businessGoal: 'Explore financial entrepreneurship', name: 'Demo Person', email: 'demo@example.com', invitation: 'preview', audience: 'professional', consent: true };
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
test('invitation enrollment adds details progressively; pathway checks dummy document metadata only', () => {
  const enrollment = { gender: 'prefer-not', civilStatus: 'prefer-not', mobile: '09000000000', contactMode: 'virtual', availability: 'Saturday' };
  assert.deepEqual(validateCandidate({ ...payload, enrollment }), {});
  assert.ok(validateCandidate({ ...payload, invitation: 'literacy', enrollment }).topic);
  assert.deepEqual(validateCandidate({ ...payload, invitation: 'literacy', enrollment: { ...enrollment, topic: 'budgeting', dateOfBirth: '2000-01-01', address: '123 Demo Street' } }), {});
  const pathway = { ...enrollment, formal: true, gender: 'woman', civilStatus: 'single', occupation: 'Demo professional', education: 'graduate', motivation: 'Explore a development pathway', commitment: 'discuss', document: { provided: true, size: 100, type: 'application/pdf' } };
  assert.deepEqual(validateCandidate({ ...payload, invitation: 'pathway', enrollment: pathway }), {});
  assert.ok(validateCandidate({ ...payload, invitation: 'pathway', enrollment: { ...pathway, document: { provided: true, size: 6 * 1024 * 1024, type: 'application/pdf' } } }).document);
  assert.ok(validateCandidate({ ...payload, invitation: 'pathway', enrollment: { ...pathway, document: { provided: true, size: 10, type: 'text/plain' } } }).document);
  assert.ok(validateCandidate({ ...payload, invitation: 'pathway', enrollment: { ...pathway, document: null } }).document);
});

test('business goal applies to 02; 03 requires formal background and dummy documents', () => {
  assert.ok(validateCandidate({ ...payload, invitation: 'literacy', businessGoal: '' }).businessGoal);
  assert.deepEqual(validateCandidate({ ...payload, invitation: 'literacy', businessGoal: 'Build financial confidence' }), {});
});

test('02 requires fictional date of birth and address and rejects impossible/future dates', () => {
 const e = { gender: 'prefer-not', civilStatus: 'prefer-not', mobile: '09000000000', contactMode: 'virtual', availability: 'Weekends', topic: 'budgeting', dateOfBirth: '2000-01-01', address: '123 Demo Street' };
 assert.deepEqual(validateCandidate({ ...payload, invitation: 'literacy', enrollment: e }), {});
 for (const dateOfBirth of ['', '2000-02-31', '2999-01-01', 'not-a-date']) assert.ok(validateCandidate({ ...payload, invitation: 'literacy', enrollment: { ...e, dateOfBirth } }).dateOfBirth);
 assert.ok(validateCandidate({ ...payload, invitation: 'literacy', enrollment: { ...e, address: '' } }).address);
});

test('01 asks gender and 02 asks civil status with prefer-not-to-say choices', () => {
 const e = { mobile: '09000000000', contactMode: 'virtual', availability: 'Weekends' };
 assert.ok(validateCandidate({ ...payload, enrollment: e }).gender);
 assert.deepEqual(validateCandidate({ ...payload, enrollment: { ...e, gender: 'prefer-not' } }), {});
 const literacy = { ...e, topic: 'planning', dateOfBirth: '2000-01-01', address: '123 Demo Street' };
 assert.ok(validateCandidate({ ...payload, invitation: 'literacy', enrollment: literacy }).civilStatus);
 assert.deepEqual(validateCandidate({ ...payload, invitation: 'literacy', enrollment: { ...literacy, civilStatus: 'prefer-not' } }), {});
});

test('03 Level Up pathway cannot accept prefer-not-to-say from the earlier exploration forms', () => {
 const e = { gender: 'prefer-not', civilStatus: 'prefer-not', mobile: '09000000000', contactMode: 'virtual', availability: 'Weekends' };
 const errors = validateCandidate({ ...payload, invitation: 'pathway', enrollment: e });
 assert.ok(errors.pathwayGender);
 assert.ok(errors.pathwayCivilStatus);
});
