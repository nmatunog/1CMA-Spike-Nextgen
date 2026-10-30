# Architecture audit — 2026-10-30

Audited GitHub default branches through the connected GitHub API. Shell cloning failed because the environment proxy was unavailable. No runtime secrets were accessed. No AGENTS.md files appeared in either repository tree.

## 1CMA-Spike-Nextgen

Base commit: `35ff8e477cb0e1ee0d9acb6cbab4e52f72d76ab2`.

- `package.json`: Next.js 15.5, React 19, NextAuth beta, Drizzle/Postgres, Tailwind 4 and Vitest. Root `dev` also kills port 3002. Root `lint` uses `next lint` despite Next.js 15; tooling requires a separate review.
- `app/page.tsx` delegates to `components/landing/LandingExperience.tsx`, a roughly 31 KB component combining hero, roadmap, quiz, candidate submission and administrative list/delete functions. `finishQuiz` posts personal details and score to `/api/candidates`; admin UI calls `/api/admin/*`. Its results describe career fit with unsupported certainty; contact details are required before the quiz.
- `lib/landing/dna-quiz-questions.ts` supplies ten scored binary questions. Questions contain unlimited-income and lifestyle framing; scoring is not a validated assessment. Retain the idea of optional exploration, not these claims or the scoring.
- `components/onboarding-form.tsx`, `app/onboarding/page.tsx` and `lib/storage/onboarding.ts` handle regional chat setup, localStorage/cookie persistence and progression into chat. They do not match the new signup scope.
- `app/layout.tsx` adds Google fonts, providers and optional analytics. API route tree includes lead, candidates, chat, auth, admin and n8n webhook endpoints. Root build is not a suitable boundary for a frontend-only sprint without further isolation.
- Reuse: conceptual roadmap, exploration affordances, existing repository/review workflow. Do not import existing persistence, authentication, chat, analytics, admin or broad marketing claims.

## SPIKE (read-only)

Base commit: `2f5e48cbdef2c81b6b0af513f56043adc8ae99d8`.

- README identifies `portal.1cma.online` as production (Cloudflare Pages and Supabase). Package scripts and tree show Vite/React workspaces, separate internship/RA-SPIKE builds, Capacitor, APIs, migrations and production deployment workflows.
- `src/components/brand/SpikeLogo.jsx` wraps a portal-specific SVG component and exports raster fallback paths. `public/spike-logo.png` and `public/spike-logo-on-dark.png` exist. Their equivalence to the newly approved attachment artwork has not been established.
- Do not modify or import the production portal, its routes, assets, authentication or backend. Recruitment describes the integrated SPIKE / RA-SPIKE development pathway without creating portal membership or promising unverified program functions.

## Decision

Add a clean static `spike-next/` subproject inside the recruitment repository. Semantic HTML, CSS tokens and ES modules fit the approved HTML handoff and modest interaction scope. This removes build/runtime dependencies and avoids a framework migration. A new repository would add administration and a cross-repository handoff without technical benefit; changing the legacy root would risk backend coupling. The additive subproject changes neither existing app behavior nor production routing. A future deployment location is an owner/Versa decision outside this PR.

## Delivery breakdown

One draft PR keeps the small subproject reviewable: UI and behavior, pure adapter/fixture contract, unit/browser tests, audit and handoff documentation. Initial asset blocker was resolved by the owner-uploaded handoff ZIP. The v4 adaptation and actual logo integration are documented in `V4_ALIGNMENT.md`; actual media and final owner/device review remain pending. No backend, live lead collection, notifications or production deployment.


## Owner handoff follow-up

Received the approved v4 HTML and four exact logo PNGs in `SPIKE_NEXT_v4_CODEX_HANDOFF.zip`. The recommendation remains static isolation: the baseline HTML confirms no framework runtime is necessary for this page. Replaced the initial provisional design with v4 section order, hero, dark/red/gold visual system and supplied branding; corrected unsupported prototype claims as required by NEXO #22. No backend or production portal changes.
