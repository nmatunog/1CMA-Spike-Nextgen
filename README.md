# 1CMA NextGen

Peer-led recruitment exploration: **AIA Next Gen landing** (roadmap + **DNA quiz**), **English-first** forms on `/onboarding`, **persona-aware** chat (stub or [Ollama](https://ollama.com)), **[Supabase](https://supabase.com) PostgreSQL** (via Drizzle + `postgres`) for leads and quiz candidates, **n8n** webhooks. The old SQLite + Litestream setup is removed (`litestream.yml` deleted).

**Repository:** [github.com/nmatunog/1CMA-Spike-Nextgen](https://github.com/nmatunog/1CMA-Spike-Nextgen)

Full product and language rules: [`DOCUMENTATION.md`](./DOCUMENTATION.md).

---

## Quick start

```bash
git clone https://github.com/nmatunog/1CMA-Spike-Nextgen.git
cd 1CMA-Spike-Nextgen
npm install
cp .env.example .env.local
```

Edit `.env.local`:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Required for NextAuth — `openssl rand -base64 32` |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | Demo login at `/login` |
| `N8N_WEBHOOK_URL` | Outbound POST on lead creation (optional) |
| `OLLAMA_MODEL` | If set, `/api/chat` calls local Ollama; else stub |
| `OLLAMA_BASE_URL` | Default `http://127.0.0.1:11434` |
| `DATABASE_URL` | Supabase Postgres connection string (required for `/api/lead`, `/api/candidates`, admin APIs) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Optional [Plausible](https://plausible.io) site domain |
| `ADMIN_CONSOLE_PASSWORD` | Admin console login (footer on landing) |

Run the dev server on **port 3002**:

```bash
npm run dev
```

**Why ports kept “busy”:** each new `next dev` starts another **Node** process. The old one often keeps running (another terminal, Cursor tab, or closed window without **Ctrl+C**). That process still holds the port → `EADDRINUSE`. This repo’s `dev` script runs **`kill-port 3002`** first so the **previous** Next dev on 3002 is stopped, then the server starts—one listener, predictable URL.

Open [http://localhost:3002](http://localhost:3002) — **landing** (`/`), **region & chat** ([`/onboarding`](http://localhost:3002/onboarding)), **chat** ([`/chat`](http://localhost:3002/chat)).

If something *else* must use 3002, start manually: `npx next dev -p 3003` (and avoid running two dev servers for this app at once).

### Working copy on an external drive (e.g. Seagate)

Your project is **not** at `/Volumes/Seagate Backup` — that folder has no `package.json`. Use the directory that contains `package.json` (this repo), for example:

```bash
cd "/Volumes/Seagate Backup/1CMA-Dev /1CMA-NexGen"
npm install
npm run build
```

Quote the path if it includes spaces. If you still see **`EPERM`** writing `package-lock.json` on the volume, fix ownership (`Get Info` → Sharing & Permissions) or clone the repo to a folder under your home directory (e.g. `~/Projects/1CMA-Spike-Nextgen`) and run npm there.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js development |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |
| `npm test` | Vitest (persona resolver tests) |
| `npm run db:push` | Push Drizzle schema to Postgres (`DATABASE_URL`) |
| `npm run db:studio` | Drizzle Studio |

---

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript**
- **NextAuth v5** (JWT, credentials demo)
- **Supabase PostgreSQL** + **Drizzle ORM** + **[postgres](https://github.com/porsager/postgres)** (Node runtime API routes)
- **n8n** outbound hooks · optional inbound `POST /api/webhooks/n8n`

---

## Deployment notes

- Set **`DATABASE_URL`** to your Supabase pooler URI (port **6543** is typical for serverless); use **`npm run db:push`** after schema changes.
- API routes use **Node** runtime (not Edge) for Postgres.
- Set **`AUTH_SECRET`** and webhook secrets in production; never commit `.env.local`.

---

## Ollama (optional)

1. Install [Ollama](https://ollama.com) and pull a model, e.g. `ollama pull llama3.2`.
2. In `.env.local`:

   ```env
   OLLAMA_MODEL=llama3.2
   # OLLAMA_BASE_URL=http://127.0.0.1:11434
   ```

3. Restart `npm run dev`. Chat responses use Ollama when reachable; otherwise the API **falls back** to the stub.

---

## n8n

- Set `N8N_WEBHOOK_URL` to your workflow webhook.
- Creating a lead (`POST /api/lead`) sends JSON with `event: lead.created` (see `lib/n8n/trigger.ts`).
- Optional: `N8N_SOCIAL_WEBHOOK_URL` for `lib/social/automation.ts`.
- Inbound: `POST /api/webhooks/n8n` with optional header `x-n8n-secret` matching `N8N_INBOUND_SECRET`.

---

## Security

- Basic headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (`next.config.ts`).
- Run `npm audit` periodically; rotate demo credentials before any public launch.

---

## License

Private / internal unless you add a license file.
