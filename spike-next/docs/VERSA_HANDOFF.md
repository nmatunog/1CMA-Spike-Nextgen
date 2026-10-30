# Versa handoff — proposed frontend contract

Versa owns backend integration. This is a **proposed** boundary, not a claim about an existing Versa endpoint. There is intentionally no configurable live URL or production HTTP adapter in this PR.

## Current interface

`createMockAdapter({ scenario, delay })(payload) -> Promise<Result>` implements `submitCandidate(payload)` entirely in memory. It does not retain payloads or use fetch/storage/logging. `scenario` is `accepted`, `rejected`, or `networkError`; returned fixture objects are copied on each call. Input must validate and include explicit demo consent. UI acceptance requires `status: "accepted"`, `mode: "mock"` and a nonempty acknowledgement. Any malformed or unacknowledged result fails closed. Every accepted message says **Demo acknowledged; no application sent or place reserved**.

```js
{
  version: 1,
  name: 'Demo Person',
  email: 'demo@example.com',
  invitation: 'preview', // preview | literacy | pathway
  audience: 'professional', // professional | parent | student
  consent: true,
  consentVersion: 'sprint-01-demo-only',
  attribution: { utm_source: 'demo', utm_medium: 'social', utm_campaign: 'cebu-01' },
  diagnostic: null // or three preview | literacy | pathway preference values
}
```

Attribution is optional and allowlisted: only three UTM code fields matching `[a-zA-Z0-9_-]{1,64}`. No raw URL, arbitrary query or referrer is forwarded. Campaign naming must exclude personal information. Audience and reflection remain browser-memory values until demo submission; reflection is optional. Contact/mobile details are requested only at invitation enrollment, after the simple entry signup. No real details should be used in this demo.

Results:

```js
{ status: 'accepted', mode: 'mock', acknowledgement: 'mock-sprint-01' }
{ status: 'rejected', mode: 'mock', code: 'DEMO_REJECTED' }
{ status: 'networkError', mode: 'mock', retryable: true }
```

Invalid payloads return rejected with `INVALID_PAYLOAD`. Duplicate clicks are disabled while pending. Close/reset increments a request generation so late replies cannot display stale receipt. There is no automatic retry or personal-data persistence. Errors allow manual retry and preserve visible fields; accepted responses clear name/email/consent.

## Before a real integration

Versa and owner must agree on HTTPS endpoint/schema, authentication that exposes no secret to the browser, origin/CORS rules, validation errors, accepted/duplicate semantics and server acknowledgements. Define request cancellation, timeouts and idempotency so a retry cannot create duplicates. Agree on privacy notice URL, data controller, lawful basis, contact-consent wording, data retention and any attribution rules.

Implement the real HTTP adapter under a separate approved change. Replace demo-only validation and consent together with approved privacy disclosures. Update response handling and acceptance tests to distinguish an actual acknowledged receipt from this mock. Do not merely switch `mode` or hide the demo label: current UI deliberately rejects live-shaped success and current form deliberately accepts only synthetic example.com/org/net emails. Review how real error codes map to accessible messages without exposing infrastructure details.

The exact supplied logos are now integrated and must stay unfiltered, aspect-ratio-preserving and unrecolored. The dark SPIKE variant uses a dark brand plate in both themes. Video configuration remains empty because the handoff ZIP has no footage/captions. Review actual media captions, transcript requirements, mobile playback, reduced motion and native controls before release.

No migrations, CRM, API server, emails, SMS, dashboards, portal membership or production deployment are included.


## Owner-directed progressive enrollment update

The opening entry is now full-device-width, video-first, with a simple fictional name/email form and explicit demo consent. “Sign up & explore” waits for an acknowledged mock response, then opens the landing preview; it does not create a portal account. Name/email may prefill invitation forms from browser memory only. Closing/reset cancels stale response handling. Native Escape remains accessible without Close/Skip buttons.

Invitation-specific payload extensions:

- **01 / preview:** base name/email/audience/invitation/consent plus `enrollment: { mobile, contactMode, availability, gender, questions? }`. Contact mode is virtual, cebu or discuss.
- **02 / literacy:** same contact/session details, plus top-level `businessGoal` (3–500 characters) and `enrollment: { topic, dateOfBirth, address, civilStatus }`. Topic is budgeting, protection, planning or explore. Date is a real calendar date in the past (ISO YYYY-MM-DD); residence address is 5–300 characters. Gender (01) and civil status (02) include `prefer-not` during exploration; 03 requires new, complete gender/civil-status selections and rejects `prefer-not`. None is used to score or recommend a career path. All details are fictional for preview.
- **03 / pathway:** contact/session details plus `enrollment: { formal: true, gender, civilStatus, occupation, education, motivation, commitment, document: { provided: true, type, size } }`. Dummy document may be PDF/PNG/JPEG, nonempty and at most 5 MiB. No filename, file bytes, FileReader, binary request or upload is used; the selected File stays only in the input until cleared. Choice change, dialog close/reset and acknowledged response clear the selection.

Real DOB, address and especially valid-ID processing require Versa/owner agreement on purpose, required fields, disclosures, retention, access controls and an authenticated secure document workflow. The mock metadata object is not an upload API or a specification for storing real documents. The UI explicitly says never to select an actual ID. Do not turn it into live collection by merely changing an endpoint.

03 is the integrated SPIKE / RA-SPIKE financial entrepreneurship pathway, developing professional practice and leadership. Licensing is a required regulatory gate before advisory work rather than the end goal. UI enrollment and mock acknowledgement never issue or guarantee a license; examination, accreditation, applicable eligibility and regulatory requirements remain necessary. Real valid-ID requirements and gender/civil-status field specifications must be verified with the licensing/integration owner.
