# #31 second-check corrections and staging email exception

Sources: [SPIKEDEV BLOCKED 7058187143](https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/31#issuecomment-7058187143)
and [owner addendum 2](https://github.com/nmatunog/NEXO/issues/32#issuecomment-7057909887).
Previous head: `dc02cd097524bbe6a309f4f4ea583b5955fc468e`. The follow-up stays on
`codex/versa-preview-capture` and draft #31. Earlier local/CI PASS did not detect
HIGH-1 and is not a release approval.

## HIGH-1, LOW-1 and LOW-2

The prior middleware rewrote any query to root, attempting to erase malformed
parameters. OpenNext preserves those parameters on rewrites. Root consequently
redirected back with the same query, looping for fbclid/utm/lang; malformed direct
links instead entered the signed-handoff rejection screen. The pre-fix CF artifact
reproduced the redirect-loop assertion in local workerd.

Now middleware only intercepts GETs on a host permitted by the unchanged preview
host gate, with at least one Versa field present. Ordinary fbclid/utm/lang queries
pass through untouched; non-preview hosts and flag-off requests have no cookie
changes. Valid capture still reuses root. Invalid capture returns an explicit 303
to clean /spike-preview, with no-store/no-referrer and expired preview/handoff
cookies. It never rewrites malformed queries, so Worker query retention cannot
loop or send them to signup.

The receiver ignores only fbclid and the explicit utm_source, utm_medium,
utm_campaign, utm_term, utm_content, utm_id allowlist. Tracking values are never
stored in the preview cookie, rendered, or used as identity. Other unknown keys,
duplicate core fields, missing/blank fields, existing caps and unsafe-character
checks remain rejected. LOW-3's additional Unicode suggestions are not included.

## Addendum 2: default-off staging email skip

`MEMBER_EMAIL_VERIFY_STAGING_SKIP=true` is honored only for the exact
nextgen-staging.nmatunog.workers.dev hostname or explicit MEMBER_LOCAL_DEMO on
localhost/127.0.0.1. No flag is added to committed Worker vars or changed live.
Other hosts ignore the flag, and absence defaults to normal verification.

Signup dispatch is request-host aware. Normal mode keeps the existing signup and
email-first path unchanged. In staging skip mode, a server-only helper stages the
password, creates and consumes an existing proof-gated verification challenge,
rotates the handoff, and performs the existing credential/code-checked activation.
It never calls the mail adapter. This is the owner's explicit staging exception;
it is not evidence that the person owns the email. No direct SQL activation,
new migration, widened grant, forged client verified flag or entropy bypass is
introduced. Existing account conflicts, disabled accounts and code eligibility
checks still apply; invalid code cannot create an account. No course entitlement
is granted. After real activation, the UI goes directly to Sign in, and successful
signin uses the existing member JWT/session flow.

Both the signed signup route and the local preview fixture use this dispatch.
No unsigned preview bridge is enabled on hosted staging: the hosted submit guard
and runtime dependency guards still return the not-connected 503. Real hosted
activation remains blocked on separately approved staging DB/identity setup and
migrations through 0014 (SPIKEDEV reports the deployed staging DB at 0009; Codex
has not connected to or changed it). Staging accounts must not be provisioned in
a pilot/production identity store.

When skip mode is on, this build has no real mail provider. Forgot-password returns
`Password reset isn't available on staging yet`, including without member storage,
instead of preparing or claiming to send a link. Origin and request-shape checks
remain. Other hosts and switch-off requests retain the normal generic expiring,
single-use reset flow. A future approved real mail provider must deliberately
replace this unavailable-state policy; an environment variable alone cannot
pretend to supply a provider.

## Reproduce the Worker regression, without deployment

After `npm run build:cf`, run:

```sh
SKIP_AUTO_SHIP=1 AUTO_SHIP=0 node tests/gia/worker-preview-smoke.mjs
```

The script generates an ignored work/ config and starts wrangler dev --local from
the actual Cloudflare artifact on loopback 8787. It has **no database binding**, no
mail adapter, no remote deployment and removes Cloudflare credentials from its
child environment. All HTTP requests go to 127.0.0.1 with synthetic staging or
production Host headers, never to the real staging URL. Test origins match the
local HTTP transport. The temporary config does not change committed/live vars.

Checks cover fbclid/utm/lang on both hosts and both entry URLs, bounded redirect
chains, cookie preservation on ordinary/non-preview requests, valid capture plus
tracking, malformed clean redirects/expired cookies/plain landing, hosted submit
503, staging reset unavailable and absence of fixture values in logs. CI now
builds the CF artifact and runs this smoke test too, so next start alone cannot
certify this redirect behaviour.

Dedicated browser modes use disposable synthetic PostgreSQL for actual staging
activation with zero mail; a separate server with DB URLs unset verifies capture,
hosted-unavailable semantics and reset-unavailable messaging. Standard verify-first
regressions still run with the skip flag off. All use SKIP_AUTO_SHIP=1 AUTO_SHIP=0.

No live DB/schema/credential/config/Access change, real mail, merge, ready-for-review
or deployment was performed. Independent SPIKEDEV re-check → Claude Q1 → ChatGPT
Rule 9 must restart at the new frozen SHA; earlier approvals do not carry over.
