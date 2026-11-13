# Synthetic visitor journey (SPIKE × Versa preview)

Synthetic-only. No live applicants, no DB migration, no production deploy.

1. Open `/spike-preview` (staging Access still in front of the Worker). `/` stays 307 → `/gia`.
2. First viewport: one-line hero **Ask GIA. Start free.**, Ask GIA composer, four job-to-be-done chips, and **Free Financial Literacy** / **Free Financial Entrepreneurship Preview** / **Level-Up (Coming soon)**. Disclaimer, Privacy notice, and STOP stay on a sticky strip.
3. Type in the hero composer or tap a chip — GIA opens (or continues) as the floating guide (same `/api/gia` as `/gia`). Chips map to approved flows: literacy, FEP, SPIKE for Interns, Talk to a 1CMA Leader. No new content claims.
4. Consent card (approved copy): name, email, unticked checkbox, Save consent and contact. STOP / don’t send IDs or documents / privacy link stay visible.
5. After consent, **Show FEP sessions** → **Book this FEP** writes the existing FEP booking; **Save leader request** writes the existing handoff. Command Center `/recruitment/command` shows the candidate event after staff sign-in (`/login` now lands on Command Center).
6. Assigned leader (admin assignment) sees only assigned records. **STOP / opt out** suppresses further contact.

Screenshots in this folder: `landing-{390,1440}.png` (first viewport), `gia-panel-{390,1440}.png`, `consent-card-{390,1440}.png`, `gia-page-{390,1440}.png`.
