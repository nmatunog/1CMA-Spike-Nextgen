# Synthetic visitor journey (SPIKE × Versa preview)

Synthetic-only. No live applicants, no DB migration, no production deploy.

1. Open `/spike-preview` (staging Access still in front of the Worker). `/` stays 307 → `/gia`.
2. Choose **Attend Free Financial Literacy Sessions** or **Join the Free Financial Entrepreneurship Preview** (direct entry allowed). **Level-Up Financial Entrepreneurship** is coming soon / not live.
3. GIA opens as the floating guide (same `/api/gia` as `/gia`). Quick replies: Join Free Financial Literacy, Explore Free Financial Entrepreneurship Preview, What should I do next?, Talk to a 1CMA Leader.
4. Consent card (approved copy): name, email, unticked checkbox, Save consent and contact. STOP / don’t send IDs or documents / privacy link stay visible.
5. After consent, **Show FEP sessions** → **Book this FEP** writes the existing FEP booking; **Save leader request** writes the existing handoff. Command Center `/recruitment/command` shows the candidate event after staff sign-in (`/login` now lands on Command Center).
6. Assigned leader (admin assignment) sees only assigned records. **STOP / opt out** suppresses further contact.

Screenshots in this folder: `landing-{390,1440}.png`, `gia-panel-{390,1440}.png`, `consent-card-{390,1440}.png`, `gia-page-{390,1440}.png`.
