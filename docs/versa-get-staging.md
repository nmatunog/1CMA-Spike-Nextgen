# Versa synthetic GET welcome

Objective: open the exact six-field GET already supplied to Versa, display all received values read-only, and reach existing GIA without account-service provisioning.

Staging URL (fictional fixture only):

https://nextgen-staging.nmatunog.workers.dev/?mfn=Test&mln=Member&me=test.member%40example.test&sfn=Test&sln=Sponsor&code=FREE-SYN00001

The contract remains `mfn`, `mln`, `me`, `sfn`, `sln`, `code`. URL-encode each value. For this synthetic preview use example.test emails and FREE-SYN00001 or other designated FREE-/PRO-SYN + five-digit fixtures. The format guard is not a Versa code checker.

On the staging hostname, root consumes a complete synthetic GET before the existing member-service route. It stores validated, unverified preview context in a separate HttpOnly, SameSite=Lax, 15-minute cookie and redirects to a clean /spike-preview URL with no-store/no-referrer headers. Refresh retains the card during that window. The same read-only card appears on /signup. Continue with GIA opens existing GIA; approved answer text and internal source metadata are unchanged. Internal KP identifiers and versions are no longer rendered in chat; safe references use “Source”.

The preview cookie is intentionally not an identity credential: editable/untrusted context can never grant account access, redeem a code, write a candidate or establish recruiter attribution. Signed handoffs and existing account APIs are unchanged. Production hosts do not enable this receiver. Local verification requires MEMBER_LOCAL_DEMO=true.

Account signup/password, verified email sign-in and reset remain in the member-service flow. This compatibility preview does not claim those hosted integrations are ready. Non-synthetic or incomplete GETs retain the existing member-service rejection path.

Deployment acceptance: SPIKEDEV independently verify the exact PR head; Claude Q1 review; deploy only the protected staging Worker after required final review. Keep nextgen-staging Pages redeploy on HOLD. Do not migrate a live database or send real mail. Confirm Cloudflare Access permits the intended synthetic tester (a narrow allowed identity), then open this actual staging URL in a fresh browser: inspect all six fields, refresh, open GIA and receive an answer, check no KP labels, repeat at 390/768/1440px. Report Worker version and exact deployed SHA. A local pass alone is not hosted acceptance.
