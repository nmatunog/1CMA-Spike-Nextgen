# SPIKE NEXT · Sprint 01 frontend review

Work order: https://github.com/nmatunog/NEXO/issues/22  
Parent: https://github.com/nmatunog/NEXO/issues/21

**Draft implementation, not approved v4 reproduction or a production release.** The approved HTML and exact logo attachments were unavailable in this session. This isolated preview implements the interaction requirements without substituting logos. Text brand names identify SPIKE, 1CMA and Versa until the approved artwork is handed over. Current colors and typography are provisional and require comparison with v4.

## Preview

From this directory (not the legacy repository root):

```sh
npm run dev
# http://127.0.0.1:4173
npm run check
npm test
```

No package install, environment variables, database or API is needed. Python 3 serves static files for local review only; it is not an application backend. Any ordinary static HTTP server works. Do not open with `file://` because ES modules require HTTP.

For browser checks, install Python Playwright in your QA environment and Chromium; then run `python3 tests/browser.py` while the preview server is running. The script currently uses `/usr/bin/chromium`; adjust `executable_path` for another environment. It checks 360, 390, 768 and 1440 pixel widths, focus containment/return, intro opt-out, theme persistence, audience choice, reflection, form validation, all mock responses, no external/POST requests, reduced motion and blocked browser storage.

The root Next.js application is untouched and does **not** serve this subproject. Reviewers must serve `spike-next/` explicitly. There is no production routing or deployment change.

## Review flows

- Intro opens once per document load; Skip/Close/Escape always dismiss it. “Don’t auto-open next time” persists only an intro preference. Watch introduction opens it again manually.
- Dark is default; light preference persists when storage is available. Browser storage refusal never blocks use.
- Three invitations allow direct signup. Audience selection changes contextual copy and prefills the form.
- Optional three-question reflection uses every answer. Majority selects an invitation; ties suggest the preview. It does not assess employability, licensing, personality or earning potential. Changing an answer clears its previous suggestion.
- Two-step signup asks for an invitation and current chapter, then fictional name, synthetic email and explicit demo consent. Choose **Acknowledged**, **Rejected** or **Offline** under “Preview response.” Errors retain entered values; acknowledged demos clear personal fields. Closing always resets fields and ignores late responses.
- No candidate values are stored, sent, logged or added to URLs. Only theme and intro preferences use localStorage. No cookies, analytics or legacy backend calls.

## Missing handoff / release gates

1. Obtain `spike_next_video_first_v4.html`, `SPIKE logo.png`, `spike-logo-on-dark.png`, `1CMA LOGO.png` and the actual Versa logo. Save originals under `assets/` (preserve aspect ratio, transparency and colors); configure paths in `src/config.js`. Compare and align this provisional layout/copy to v4 before marking design complete. Existing SPIKE portal raster logos were discovered but not copied because equivalence to approved attachments is unverified.
2. Obtain approved intro footage, poster and accurate English captions. Set all paths under `intro`. Video remains a labeled placeholder until both video and captions are configured. Muted autoplay is attempted unless reduced motion is requested; native controls support manual playback and mute. Rejected playback has an instruction; failed media retains a fallback. No video bytes load while absent.
3. Verify invitation wording, free-entry scope, schedules, eligibility, later program costs, licensing language and 1CMA/AIA representations. No income, employment, equity or licensing guarantees are made.
4. Versa supplies the actual API contract, privacy disclosures, valid contact-consent wording, timeout/retry/duplicate semantics and integration owner. This mock must not be used to collect real applicants. See `docs/VERSA_HANDOFF.md`.
5. Complete approved-artwork validation, actual-video/caption QA, screen-reader/device review and contrast review after final styling. Owner approves public launch separately. Do not deploy this review preview.
