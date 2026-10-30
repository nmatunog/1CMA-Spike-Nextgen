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

Attribution is optional and allowlisted: only three UTM code fields matching `[a-zA-Z0-9_-]{1,64}`. No raw URL, arbitrary query or referrer is forwarded. Campaign naming must exclude personal information. Audience and reflection remain browser-memory values until demo submission; reflection is optional. No phone number is collected.

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

Replace placeholder brand/video config only with approved local assets. Keep logos unfiltered, aspect-ratio-preserving and unrecolored. Verify dark/light artwork against approved variants; review video captions, transcript requirements, mobile playback, reduced motion and native controls on actual media.

No migrations, CRM, API server, emails, SMS, dashboards, portal membership or production deployment are included.
