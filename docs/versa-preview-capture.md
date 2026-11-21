# Staging display capture: format-agnostic six fields

Current second-check corrections and addendum 2: [Worker fix and staging email mode](versa-preview-worker-fix.md).

Sources: SPIKEDEV's [brief 7057560464](https://github.com/nmatunog/NEXO/issues/32#issuecomment-7057560464)
and [addendum 7057585560](https://github.com/nmatunog/NEXO/issues/32#issuecomment-7057585560).
Base: `1650192c042f387b030e5279e65db43fea49f0e9`, the #30 merge.
This is a new draft only; it does not activate the change or release any source.

Both `/` and `/spike-preview` accept exactly one of each lowercase field:
`mfn`, `mln`, `me`, `sfn`, `sln`, `code`. Email and code are display strings, with
**no format validation**. Names remain capped at 80 characters, me at 120, code
at 32; blank/whitespace-only values, unknown/duplicate/missing keys, controls,
bidi overrides/isolates and U+FFFD remain rejected. Explicit fbclid/common utm
tracking keys are ignored and never stored; other unknown keys still fail. React escapes all output.

A direct `/spike-preview?...` request is captured in middleware before the Server
Component renders, because cookies cannot be set during component render. It
internally rewrites valid capture requests to the existing root GET receiver,
which sets the same 15-minute HttpOnly, SameSite=Lax cookie (Secure on HTTPS)
and 303 redirects to the clean `/spike-preview`. The root receiver is unchanged.
Invalid direct-page queries clear stale context and redirect to the plain landing
page, without partial prefill or a crash. Clean requests pass through unchanged.
Middleware ignores ordinary queries and non-preview hosts, and uses an explicit
clean 303 for malformed capture (not a rewrite). Both entry points keep the existing
flag/host gate. Neither Access nor Worker
configuration is changed.

The cookie prefills member name, readonly email/username, sponsor and code on
signup. Passwords remain empty. Signin can display the captured email too. These
are unverified strings, not account credentials or code validation. No database,
KV, analytics, logging or mail adapter is added. Tests assert no captured field
values appear in browser/server console logs; the no-service browser harness
runs with no DB URLs and member onboarding disabled. Hosted submit remains 503
with the existing human-readable not-connected message. No account is created
and no mail is sent from that preview.

Signed arrival/handoff transport, SQL proofs, mail implementation, auth, runtime,
migrations, code verifier and owner wording remain unchanged. Addendum 2 adds a
default-off request-host-scoped staging signup policy; see the correction packet. No server-side
capture store or new integration service. Cookie fields are intentionally
unverified and are not promoted to trusted hosted identity. The preview now admits
arbitrary values, so it must not be used as a trusted issuer or real signup path.
The existing signed/member flows retain their independent checks unchanged.

Test examples use fictional names and reserved example domains only:

```text
/spike-preview?mln=Example&mfn=Preview&me=dennis%40example2.test&sfn=Test&sln=Sponsor&code=NBM-12345
/?mfn=Preview&mln=Example&me=dennis%40hismail.example&sfn=Test&sln=Sponsor&code=12345678
```

The flag remains required (`VERSA_GET_STAGING_ENABLED=true`) and gating is not
broadened. Enabling flags, changing Access, hosted member DB/mail setup, merging
and deploying are outside this draft. Initial URLs and cookies still traverse
upstream infrastructure; no new application logging/storage is introduced and
no claim is made that browser history or upstream systems never observed the
original request. The redirect leaves only the clean page in the navigation entry.

All validation uses `SKIP_AUTO_SHIP=1 AUTO_SHIP=0`. Independent SPIKEDEV QA,
Claude Q1 and ChatGPT Rule 9 must use the exact pushed head. Nilo's explicit OK
for that SHA is still needed before merge/redeploy.
