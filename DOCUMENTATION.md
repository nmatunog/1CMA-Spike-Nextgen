# 1CMA NextGen — Project documentation & reload guide

**Last updated:** 2026-03-22 (saved before session exit)

This file is the **single source of truth** for product decisions, language rules, and what has been built in this repository. If a chat or IDE session closes, **open this file first** to restore context. (Cursor chat itself is not stored in this folder; export chats from the Cursor UI if you need a verbatim transcript.)

**Quick setup (clone → run):** see **[README.md](./README.md)**.

**Remote repository:** [github.com/nmatunog/1CMA-Spike-Nextgen](https://github.com/nmatunog/1CMA-Spike-Nextgen) — latest `main` should match this doc after each push.

---

## 1. How to reload context quickly

1. Skim **[README.md](./README.md)** for install, env vars, port **3002**, and scripts.
2. Read **§2 Product vision** and **§3 Language policy** (non‑negotiable UX rules).
3. Skim **§5 Repository map** (what each file does).
4. Follow **§7 Local setup** to run the app.
5. Use **§8 Implementation timeline** to see what was done in order.

---

## 2. Product vision (from planning discussions)

### 2.1 Audience

- **Primary:** Gen Z, then Gen Y — mobile/social‑native, low patience for slow loads.
- **Goal:** Recruitment platform that **attracts, engages, and sustains**; AI‑assisted chat; peer tone in conversational layers only.

### 2.2 Core engineering principles (codebase)

| Principle | Meaning here |
|------------|----------------|
| **Keep it simple** | Small vertical slices; avoid over‑engineering. |
| **Readability** | Clear names; self‑documenting structure. |
| **DRY** | Shared `lib/` modules; one chat shell; one persona resolver. |

### 2.3 Strategic pillars (1CMA standard — summarized)

| Pillar | Implementation note in this repo |
|--------|--------------------------------|
| **Zero‑load engagement** | Next.js App Router; marketing landing on `/`; `/onboarding` for forms. |
| **Peer mentor persona** | **Chat only** — see **§3** (English for all formal UI). |
| **Agentic intelligence** | Stub chat in `lib/chat/stub-reply.ts` + `POST /api/chat`; optional **Ollama** (`OLLAMA_MODEL`); n8n hooks. |
| **Resilience** | SQLite file `data/app.db`; optional **Litestream** via `litestream.yml`; Supabase optional for quiz data. |
| **AIA branded excellence** | AIA red `#D31145`, purple, cyan; dark marketing UI on `/`; design tokens in `app/globals.css` for app shell pages. |

### 2.4 AI cost posture (planning)

- Prefer **subscription‑light** paths: local **Ollama**, **n8n** workflows.
- Default chat uses **stub** or **Ollama** when configured — no paid LLM required.

### 2.5 Marketing / compliance note

- Landing copy (roadmap, rewards, DNA framing) is **product marketing**. **Insurance / AIA compliance** must review before public launch (income claims, subsidies, etc.).

---

## 3. Language policy (critical)

### 3.1 Formal UI — English only

Use **standard English** for:

- Forms, labels, placeholders, validation, navigation, toasts, transactional copy.

**Do not** use Conyo Bisaya (or mixed casual tone) on formal layouts.

### 3.2 Chat / simulated agents — localized peer tone

| Persona ID | When |
|------------|------|
| `peer_en` | Default; unknown region; regions not mapped to Taglish/Bisaya chat. |
| `taglish_conyo` | Region codes such as `NCR`, `III`, `IV-A` (see `lib/i18n/region-persona.ts`) or explicit Taglish province list. |
| `conyo_bisaya` | **Only** for provinces in the **Cebuano allowlist** (e.g. Cebu, Bohol, Siquijor, Southern Leyte, Zamboanga Peninsula slugs as configured). |

### 3.3 Regional capture

- **`/onboarding`** collects **region + province** to drive **`resolveChatPersona()`** for **chat** only.

### 3.4 Known data caveat

- **`negros_oriental`** appears in `data/geo.ts` (Region VII) but is **not** in `CHAT_CONYO_BISAYA_PROVINCES`, so chat stays **`peer_en`** until you add it.

---

## 4. Architecture overview

```
User → GET /  (AIA Next Gen landing: roadmap, DNA quiz modal, rewards, admin CTA)
     → optional Supabase insert from browser (quiz “candidates” table)
     → GET /onboarding → English region/province form
     → localStorage + cookie (`lib/storage/onboarding.ts`)
     → GET /chat → POST /api/chat (persona + stub or Ollama)
     → first visit to chat → POST /api/lead → SQLite + optional n8n webhooks
     → optional NextAuth sign-in → userId on leads when logged in

Admin (after password via POST /api/admin/verify + httpOnly cookie):
     → GET /api/admin/candidates (server uses service role if set)
     → DELETE /api/admin/candidates/[id]
```

- **Runtime:** Node.js for API routes using `better-sqlite3` (`export const runtime = "nodejs"`).
- **Auth:** NextAuth v5 (`auth.ts`); **`AUTH_SECRET`** synced into `process.env` at startup so Auth.js never hits `MissingSecret` (see `auth.ts`).
- **Automation:** `lib/n8n/trigger.ts`, `lib/social/automation.ts`; inbound `app/api/webhooks/n8n/route.ts`.
- **Supabase (optional):** `NEXT_PUBLIC_SUPABASE_*` for quiz writes; `SUPABASE_SERVICE_ROLE_KEY` for server-side admin list/delete.

---

## 5. Routes (user-facing)

| Route | Purpose |
|-------|---------|
| `/` | Marketing landing: hero, roadmap accordions, rewards, **DNA quiz** modal, footer **Admin Console** link. |
| `/onboarding` | English-only region + province; links to chat. |
| `/chat` | Peer chat UI; requires onboarding data in `localStorage` or redirects home. |
| `/login` | Demo credentials (env‑driven). |

---

## 6. Repository map (key paths)

| Path | Purpose |
|------|---------|
| `app/page.tsx` | Composes **LandingNav** + **LandingExperience** (not the old inline onboarding). |
| `app/onboarding/page.tsx` | Region/province **English** form + link back to `/`. |
| `app/layout.tsx` | **Plus Jakarta Sans**, metadata, Plausible, `Providers`. |
| `app/globals.css` | `@import "tailwindcss"` (v4) + `:root` tokens for non-landing pages. |
| `postcss.config.mjs` | `@tailwindcss/postcss`. |
| `components/landing/LandingExperience.tsx` | Full landing + quiz + admin UI (client). |
| `components/landing/LandingNav.tsx` | Sticky nav for `/`. |
| `components/onboarding-form.tsx` | English region/province; `id="location"` for anchors. |
| `components/app-header.tsx` | Header for `/onboarding`, `/chat`, `/login`. |
| `components/chat-panel.tsx` | Chat; shows `source` ollama/stub when returned by API. |
| `app/icon.tsx` | Dynamic 32×32 PNG (AIA red “1”) via `next/og` **edge**. |
| `lib/landing/dna-quiz-questions.ts` | Quiz question data. |
| `lib/supabase/browser.ts` | Browser Supabase client (env‑gated). |
| `app/api/admin/verify/route.ts` | `POST` — sets httpOnly cookie if `ADMIN_CONSOLE_PASSWORD` matches. |
| `app/api/admin/candidates/route.ts` | `GET` — list candidates (cookie + Supabase). |
| `app/api/admin/candidates/[id]/route.ts` | `DELETE` — remove row (cookie + Supabase). |
| `app/api/chat/route.ts` | Persona + stub or Ollama. |
| `app/api/lead/route.ts` | SQLite lead + n8n. |
| `auth.ts` | NextAuth; ensures `AUTH_SECRET` in `process.env`. |
| `next.config.ts` | `better-sqlite3` external, **security headers**, **`/favicon.ico` → `/icon` rewrite**. |
| `package.json` | **`dev`:** `kill-port 3002 && next dev -p 3002` (frees stuck Next dev on 3002). |
| `.env.example` | All public/server keys **documented**; never commit real secrets. |

**Not in repo:** `data/app.db`, `.env.local`, Supabase service role, production passwords.

---

## 7. Data models

### `leads` (SQLite / Drizzle)

- `id`, `created_at`, `region_code`, `province_slug`, `resolved_persona`, `email`, `user_id`

### `candidates` (Supabase — optional)

- Intended columns: `id`, `name`, `email`, `phone`, `score`, `created_at` (see `.env.example` SQL comment).
- **RLS** must be configured for anon insert (quiz) and service-role or policy for admin reads.

---

## 8. Local setup

1. **`npm install`**
2. **`cp .env.example .env.local`** and set:
   - **`AUTH_SECRET`** (strong random)
   - **`NEXT_PUBLIC_SUPABASE_URL`**, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (quiz + client)
   - **`SUPABASE_SERVICE_ROLE_KEY`** (recommended for admin API list/delete)
   - **`ADMIN_CONSOLE_PASSWORD`** (admin console)
   - Optional: `DEMO_*`, `N8N_*`, `OLLAMA_*`, Plausible domain
3. **`npm run dev`** — opens **[http://localhost:3002](http://localhost:3002)** (script runs **`kill-port 3002`** first to avoid stacked `next dev` processes).
4. **`npm run build`** / **`npm test`** before deploy.

---

## 9. Implementation timeline (summary)

1. Planning, language policy, `lib/i18n`, Next.js scaffold, onboarding, chat stub, SQLite, Auth, n8n, Litestream.
2. README, Ollama optional path, Vitest (persona tests), Plausible, security headers, hero copy, auth secret fix, favicon + rewrite.
3. **Landing + DNA quiz:** Tailwind v4, `LandingExperience`, `LandingNav`, `/onboarding` split, Supabase browser client, admin API routes, Plus Jakarta, `kill-port` on dev, push to GitHub (`main`).

**Styling:** **Tailwind CSS v4** is integrated (`@import "tailwindcss"`). Older note about “no Tailwind” is **obsolete**.

---

## 10. Maintenance checklist

- [ ] Comms/compliance review of **landing** and **quiz** copy.
- [ ] Supabase **RLS** policies for `candidates`; rotate keys if ever leaked.
- [ ] Keep `data/geo.ts` slugs aligned with `lib/i18n/region-persona.ts`.
- [ ] Replace stub / tune Ollama prompts + guardrails when going live.
- [ ] Production: set **`AUTH_SECRET`**, **`ADMIN_CONSOLE_PASSWORD`**, Supabase keys on the host (never in git).

---

## 11. Related files outside this repo

- **Cursor chat history:** export from the Cursor UI if you need it; not stored in this folder.
- **Agent transcripts:** may exist under your user’s Cursor data directory; not part of this git tree.

---

*End of documentation.*
