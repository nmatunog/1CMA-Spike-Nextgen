// Explicitly local, synthetic-only harness; never a deployment or real mail sender.
import { writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
process.env.SKIP_AUTO_SHIP = '1';
process.env.AUTO_SHIP = '0';
process.env.MEMBER_ONBOARDING_ENABLED = 'true';
process.env.MEMBER_LOCAL_DEMO = 'true';
process.env.MEMBER_ALLOW_PLAIN_QUERY = 'false';
process.env.MEMBER_HANDOFF_ISSUER_SECRET = randomBytes(32).toString('hex');
await mkdir('work', { recursive: true });
await writeFile('work/member-issuer.json', JSON.stringify({ secret: process.env.MEMBER_HANDOFF_ISSUER_SECRET }), { mode: 0o600 });
process.env.MEMBER_PUBLIC_ORIGIN = 'http://127.0.0.1:3002';
process.env.MEMBER_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.GIA_DEMO_BIND_ADDRESS = '127.0.0.1';
await import('./demo-server.mjs');
