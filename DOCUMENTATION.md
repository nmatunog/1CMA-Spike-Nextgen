# 1CMA NextGen — Project documentation & reload guide

**Last updated:** 2026-03-22  

This file is the **single source of truth** for product decisions, language rules, and what has been built in this repository. If a chat or IDE session closes, **open this file first** to restore context. (Cursor chat itself is not stored in this folder; export chats from the Cursor UI if you need a verbatim transcript.)

**Quick setup (clone → run):** see **[README.md](./README.md)**.

---

## 1. How to reload context quickly

1. Skim **[README.md](./README.md)** for install, env vars, and scripts.
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
| **Zero‑load engagement** | Next.js App Router; static‑friendly pages; minimal client JS on first paint. |
| **Peer mentor persona** | **Chat only** — see **§3** (English for all formal UI). |
| **Agentic intelligence** | Stub chat in `lib/chat/stub-reply.ts` + `POST /api/chat`; ready to swap for Ollama / n8n later. |
| **Resilience** | SQLite file `data/app.db`; optional **Litestream** via `litestream.yml`; export story can extend later. |
| **AIA branded excellence** | CSS variables in `app/globals.css`: red `#D31145`, purple, cyan; **Gen Z dark mode** base. |

### 2.4 AI cost posture (planning)

- Prefer **subscription‑light** paths: local **Ollama**, **n8n** workflows, edge/small models when you add them.
- Current code uses **no paid LLM** — responses are **deterministic stubs** keyed by persona.

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

- Onboarding collects **region + province** to drive **`resolveChatPersona()`** for **chat** only.
- **Tagalog–English conyo** applies where Tagalog‑primary regions are configured.
- **Conyo Bisaya** applies only for **Cebuano‑speaking** areas as defined in code (narrow list — extend in `CHAT_CONYO_BISAYA_PROVINCES` if product expands).

### 3.4 Known data caveat

- **`negros_oriental`** appears in `data/geo.ts` (Region VII) but is **not** in `CHAT_CONYO_BISAYA_PROVINCES`, so chat stays **`peer_en`** until you deliberately add it.

---

## 4. Architecture overview

```
User → Next.js pages (English UI)
     → localStorage + cookie (`lib/storage/onboarding.ts`) for region/province
     → /chat → POST /api/chat (persona + stub reply)
     → first visit to chat → one POST /api/lead → SQLite + optional n8n webhooks
     → optional sign-in → NextAuth (JWT) → userId on future leads
```

- **Runtime:** Node.js for API routes that use `better-sqlite3` (`export const runtime = "nodejs"`).
- **Auth:** NextAuth v5 (`auth.ts`, `app/api/auth/[...nextauth]/route.ts`).
- **Automation:** Outbound `lib/n8n/trigger.ts`, `lib/social/automation.ts`; inbound `app/api/webhooks/n8n/route.ts`.

---

## 5. Repository map (source files)

| Path | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout, Inter font, `Providers` (NextAuth `SessionProvider`). |
| `app/globals.css` | AIA palette tokens, dark theme, focus styles. |
| `app/page.tsx` | Home: English onboarding. |
| `app/chat/page.tsx` | Chat page shell. |
| `app/login/page.tsx` | Demo credentials login. |
| `app/providers.tsx` | Client `SessionProvider`. |
| `app/api/chat/route.ts` | Resolves persona; returns stub agent text. |
| `app/api/lead/route.ts` | Inserts lead row; calls n8n + social automation hooks. |
| `app/api/webhooks/n8n/route.ts` | Inbound webhook (optional `N8N_INBOUND_SECRET`). |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth GET/POST handlers. |
| `auth.ts` | NextAuth config (Credentials provider, JWT sessions). |
| `components/app-header.tsx` | Header / nav. |
| `components/onboarding-form.tsx` | **English** region + province selects; `localStorage` + cookie. |
| `components/chat-panel.tsx` | Chat UI; calls `/api/chat`; one-time `/api/lead` sync. |
| `data/geo.ts` | Region + province dropdown data (must match `lib/i18n` slugs). |
| `lib/i18n/chat-persona.ts` | Persona constants. |
| `lib/i18n/region-persona.ts` | Allowlists + `resolveChatPersona()`. |
| `lib/i18n/index.ts` | Barrel exports. |
| `lib/chat/stub-reply.ts` | Persona‑aware stub strings (chat layer). |
| `lib/chat/persona-system-prompts.ts` | System prompts for optional Ollama. |
| `lib/chat/ollama.ts` | Calls Ollama `/api/chat` when `OLLAMA_MODEL` is set. |
| `components/plausible-analytics.tsx` | Optional Plausible script if `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set. |
| `vitest.config.ts` | Unit tests (`npm test`). |
| `README.md` | Quick start, env table, deploy notes. |
| `lib/db/schema.ts` | Drizzle `leads` table. |
| `lib/db/client.ts` | SQLite connection + `CREATE TABLE IF NOT EXISTS`. |
| `lib/storage/onboarding.ts` | Keys: `cma_onboarding_v1`, `cma_lead_synced_v1`, cookie. |
| `lib/n8n/trigger.ts` | POST to `N8N_WEBHOOK_URL`. |
| `lib/social/automation.ts` | POST to social or fallback n8n URL. |
| `drizzle.config.ts` | Drizzle Kit config (`npm run db:push`). |
| `litestream.yml` | Example replication config for `data/app.db`. |
| `.env.example` | Required and optional environment variables. |
| `next.config.ts` | `serverExternalPackages: ["better-sqlite3"]`. |
| `package.json` | Scripts and dependencies. |

**Not in repo:** `data/app.db` (created at runtime; gitignored), `.env.local` (local secrets).

---

## 6. Data model

### `leads` (SQLite / Drizzle)

- `id` (UUID text)
- `created_at` (timestamp)
- `region_code`, `province_slug`
- `resolved_persona` (persona id at insert time)
- `email` (optional)
- `user_id` (optional — from NextAuth session)

---

## 7. Local setup

1. **Install dependencies** (requires sufficient disk space; `ENOSPC` has occurred on this machine before):

   ```bash
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.example .env.local
   ```

   Set at minimum:

   - `AUTH_SECRET` — e.g. `openssl rand -base64 32`
   - `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` — demo login for `/login`

   Optional:

   - `N8N_WEBHOOK_URL` — outbound lead/social events
   - `N8N_SOCIAL_WEBHOOK_URL` — overrides social hook target
   - `N8N_INBOUND_SECRET` — protects `POST /api/webhooks/n8n`

3. **Run**

   ```bash
   npm run dev
   ```

   Flow: `/` → save region/province → `/chat` → stub messages; first chat load creates a lead if not yet synced.

4. **Database tooling**

   ```bash
   npm run db:push    # apply Drizzle schema to ./data/app.db
   npm run db:studio  # optional Drizzle Studio
   ```

5. **Production / SQLite**

   - `better-sqlite3` needs **Node runtime** (not Edge) for these routes.
   - For serverless hosts, plan **Turso/libSQL** or another store; Litestream suits **long‑running Node + file** deployments.

6. **Litestream**

   - Edit `litestream.yml` with your bucket and credentials; run the `litestream` CLI alongside the app (see [Litestream docs](https://litestream.io/)).

---

## 8. Implementation timeline (what was done, in order)

Chronological record of work agreed in the assistant session:

1. **Planning** — Recruitment vision, Gen Z/Y, UI/UX principles, AI posture (free/cheap engines, n8n + Ollama mentioned), social automation hooks, five pillars, suggested revisions.
2. **Language policy** — English formal UI; Conyo Bisaya only in chat for defined Cebuano areas; Tagalog–English conyo where appropriate; regional capture for switching.
3. **`lib/i18n`** — `ChatPersona` ids + `resolveChatPersona()` + region/province allowlists.
4. **Execution order 1→5** (scaffold → design → onboarding → chat stub → DB/auth/n8n/Litestream):
   - **1:** Next.js 15 + TS + ESLint; integrated `lib/i18n` (Tailwind not added — **CSS variables** used instead).
   - **2:** AIA dark theme tokens + header + Inter.
   - **3:** English onboarding + `data/geo.ts` + `localStorage` + cookie.
   - **4:** `POST /api/chat` + stub replies + `/chat` UI.
   - **5:** SQLite + Drizzle + `leads` table; NextAuth credentials demo; `notifyN8n` + `enqueueSocialEvent`; `litestream.yml`; inbound n8n route; `.env.example`.

**Build verification:** `npm run build` and `npm run lint` succeeded after implementation.

**Later iteration:** root `README.md`; optional **Ollama** in `/api/chat` with fallback stub; **Vitest** tests for `resolveChatPersona`; **Plausible** hook in layout; **security headers** in `next.config.ts`; home **hero + CTAs**; privacy copy on onboarding.

---

## 9. Styling note

- **Tailwind** was **not** added; styling is **plain CSS** (`globals.css` + inline styles in components) to keep dependencies small and avoid tooling issues during setup.
- You may add Tailwind later without changing the persona/language rules.

---

## 10. Maintenance checklist

- [ ] Keep `data/geo.ts` province **slugs** in sync with `lib/i18n/region-persona.ts`.
- [ ] Replace `stub-reply.ts` with real LLM + guardrails + RAG when ready.
- [ ] Review `CHAT_TAGLISH_REGION_CODES` (Region III is broad — may need province‑level Taglish).
- [ ] Add automated tests for `resolveChatPersona` edge cases.
- [ ] Ensure `AUTH_SECRET` and webhook secrets are set in production.

---

## 11. Related files outside this repo

- **Cursor chat history:** Use Cursor’s UI to export or pin important threads; this project does not duplicate them on disk.
- **Agent transcripts:** Cursor may store transcripts under your machine’s Cursor user data directory; they are not part of this git tree.

---

*End of documentation.*
