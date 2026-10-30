# SPIKE NEXT · Sprint 01 frontend review

Work order: https://github.com/nmatunog/NEXO/issues/22  
Parent: https://github.com/nmatunog/NEXO/issues/21

The owner-supplied `SPIKE_NEXT_v4_CODEX_HANDOFF.zip` is now integrated. This isolated frontend follows v4's obsidian/red/gold art direction, cinematic hero, three invitations, audience lanes, optional diagnostic, integrated SPIKE / RA-SPIKE pathway, agency section and footer. Exact supplied logos are included unchanged. See `docs/V4_ALIGNMENT.md` for a section-by-section comparison and deliberate corrections to unsupported claims.

## Preview

From this directory (not the legacy repository root):

```sh
npm run dev
# http://127.0.0.1:4173
npm run check
npm test
```

No package install, environment variables, database or API is needed. Python 3 serves static files for local review only; it is not an application backend. Any ordinary static HTTP server works. Use HTTP rather than `file://` for ES modules.

Browser checks: run `python3 tests/browser.py` with the preview server running, Python Playwright installed and Chromium at `/usr/bin/chromium` (adjust executable path if needed). Tests cover 360, 390, 768 and 1440 px, logo loading, both themes, focus containment/return, intro controls, audience selection, reflection, validation, mock responses, reduced motion and denied browser storage.

The root Next.js application does **not** serve this subproject. Serve `spike-next/` explicitly. There is no production routing or deployment change.

## Review flows

- The opening video screen fills the device width and dynamic viewport. A simple name/email/demo-consent form offers “Sign up & explore” instead of Close/Skip buttons. Only an acknowledged mock response opens the landing page and remembers completion as a browser preference. Native Escape dismissal remains for keyboard accessibility; opening from Watch lets reviewers retry it. No portal account is created.
- Dark is default; light preference persists when storage is available. The cinematic hero and official dark SPIKE artwork retain a dark background in both themes. The supplied 1CMA image also uses a dark plate to preserve white lettering without recoloring.
- Three invitations allow direct signup. Selecting an audience lane changes contextual copy and prefills the form.
- Optional three-question reflection uses every answer. Majority selects an invitation; ties suggest the preview. It does not assess employability, licensing, personality or earnings. Editing an answer clears its previous suggestion.
- Invitation enrollment asks for the chosen path and current chapter, then fictional contact/session details and demo consent. 01 asks name, email, mobile/contact preferences and gender; 02 adds fictional date of birth, residence address, civil status and a simple business goal (plus literacy topic); 03 is the Level Up financial entrepreneurship pathway: it requires complete gender/civil-status selections, role, education, motivation, available development time and a dummy supporting-document selector. “Prefer not to say” is available in early 01/02 exploration but not in 03. The entry signup remains name/email only. Choose **Acknowledged**, **Rejected** or **Offline** under “Preview response.” Errors retain values; acknowledged demos clear personal fields and selected documents. Early 01/02 exploration fields include “Prefer not to say”; 03 requires complete answers. Closing resets fields and ignores late responses.
- Candidate values are never persisted, sent, logged or added to URLs. An acknowledged entry signup can prefill name/email from session memory until page refresh. Documents are never read or uploaded: only dummy-file type/size metadata reaches the in-memory mock. Only theme and intro preferences use localStorage. No cookies, analytics or legacy backend calls.

## Supplied assets and reference

`assets/` contains the four exact PNGs and a SHA-256 manifest. The supplied SPIKE dark treatment is displayed on dark plates, including in light mode; the original light artwork is retained unchanged for brand review. No filters, cropping or recoloring are applied. The full source HTML is archived byte-for-byte at `reference/spike_next_video_first_v4.html.txt`, as text so its external scripts and media cannot execute accidentally. It is not a runtime dependency.

## Remaining release gates

1. Obtain approved intro footage, poster and accurate English captions; none is in the ZIP. Set paths under `intro` in `src/config.js`. Video stays a labeled placeholder until video and captions are configured. Muted autoplay is attempted unless reduced motion is requested. Native controls support manual playback/mute; failed playback/media has a fallback.
2. Verify free-entry wording, schedules, eligibility, later costs, licensing language and 1CMA/AIA representations. No income, appointment, equity or licensing guarantees are made.
3. Versa supplies the real API contract, privacy disclosures, contact-consent wording, timeout/retry/duplicate semantics and integration owner. This synthetic-data mock cannot collect real applicants. See `docs/VERSA_HANDOFF.md`.
4. Owner reviews this v4 adaptation and brand treatments. Actual-video, screen-reader and physical-device QA remain before public launch. No deployment is included.
