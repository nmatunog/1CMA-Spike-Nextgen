# Synthetic visitor journey (SPIKE × Versa preview)

Synthetic-only. No live applicants, no DB migration, no production deploy.

1. Open `/spike-preview` (staging Access still in front of the Worker). `/` stays 307 → `/gia`.
2. First viewport: one-line hero **Ask GIA. Start free.**, Ask GIA composer, **Find your path** (3 taps: goal, situation, time), the three invitations, and the AIA advisor 4-step journey. **About the AIA advisor career** is on this page (paraphrased, sourced, no generic Join us CTA). Disclaimer, Privacy notice, and STOP stay on a sticky strip.
3. Three taps route into GIA with a matching deterministic script and highlight the invitation (or the recruiter step). Nothing is stored. No account. No PII. Interns never land on AIA registration.
4. GIA stays alive: `msg-in`, skippable typing dots (off under `prefers-reduced-motion`), and follow-up chips after every answer including **How do I join AIA / register?** and the career KPs.
5. Consent card (approved copy): name, email, unticked checkbox, Save consent and contact. STOP / don’t send IDs or documents / privacy link stay visible. No DOB, address, or ID.
6. After consent, the **Register with your recruiter** step shows an attributed `join-us-now?reference=` link (assigned, else `AIA_DEFAULT_RECRUITER_REGISTRATION_URL`) and a copy-ready **Your details for AIA registration** card (name and email only, AIA field-order config, copy / copy all). Opening the link never marks registration as done. Nothing is sent to AIA. If no attributed URL is configured: **Your recruiter will contact you** (no link).
7. After consent, **Show FEP sessions** → **Book this FEP** writes the existing FEP booking; **Save leader request** writes the existing handoff. Command Center `/recruitment/command` shows the candidate event after staff sign-in (`/login` now lands on Command Center).
8. Assigned leader (admin assignment) sees only assigned records. **STOP / opt out** suppresses further contact.

AIA advisor path only (not intern or free-learner paths):

```mermaid
flowchart LR
  L["1 Free Financial Literacy<br/>Free"] --> F["2 Free FEP<br/>Free"]
  F --> R["3 Register with your recruiter<br/>With your recruiter"]
  R --> S["4 SPIKE Venture Studio<br/>Coming soon"]
```

Step 3 never opens a generic AIA sign-up. Public AIA pages are labelled **(reference)** links only, never the Register CTA. AIA’s official process is the system of record. SPIKE does not submit or confirm AIA applications. Level-Up payment and AIA registration are separate checks.

Screenshots in this folder (390 and 1440): `landing-*`, `path-picker-*`, `journey-*`, `about-aia-*`, `gia-panel-*`, `gia-typing-*`, `aia-register-*`, `consent-card-*`, `copy-details-*`, `recruiter-cta-*`, `stop-*`, `gia-page-*`.
