# Sprint 01 QA evidence

Executed 2026-10-30 on Node 24.19.0 and local Chromium via Python Playwright.

- `npm run check`: all three source modules parse.
- `npm test`: all three test files pass (fourteen individual test groups: two source/asset tests, ten adapter/validation/reflection/attribution/enrollment tests, two theme contrast tests). Also ran every test module directly to confirm all fourteen groups execute.
- `python3 tests/browser.py`: passed at 360×800, 390×844, 768×1024 and 1440×1000. Native dialog focus containment supplemented with explicit Tab wrapping; Escape/close focus return verified. Theme persistence, entry completion preference/manual reopen, audience prefill, reflection majority, form errors, acknowledged/rejected/offline states passed. No horizontal overflow; zero external requests, no POST requests, zero JavaScript errors.
- Reduced motion with localStorage denied: intro remains skippable, video paused, theme works in-session, and closing during submission cannot display a late acknowledgement on reopening.
- Only `spike-next-theme` and `spike-next-skip-intro` are stored; document cookie stays empty. Accepted demo clears name/email/consent.
- Both themes' text/muted/accent/error tokens exceed 4.5:1 on all solid surfaces; primary button text exceeds 4.5:1; control boundary tokens exceed 3:1. This token test does not certify every rendered pixel or final artwork.
- Inspected full-page mobile light and desktop dark screenshots locally for layout hierarchy and wrapping. Rechecked after v4 integration: cinematic hero, actual brand lockups, three invitation cards, audience lanes, diagnostic, pathway grid and agency/footer treatments.

## Pending

The approved v4 HTML and all four exact PNGs have now been integrated. Source/asset SHA-256 tests verify byte-for-byte integrity. Expanded Chromium checks assert the v4 hero heading, successful loading of every logo image, exact logo URLs and dark-brand-plate treatment in light mode. `docs/V4_ALIGNMENT.md` records visual/content adaptations. Actual video/captions, autoplay failure across Safari/iOS/Android, screen reader announcements and physical-device behavior remain to be checked with approved media and final owner styling review. No backend or production deployment was tested or performed. No full legacy Next.js build was run: it is outside the isolated subproject and its files are unchanged.


## Current regression coverage

Full-screen film bounds and optional signup behavior are checked at 320×568, 360×800, 390×844, **470×900**, 844×390 landscape, 768×1024 and 1440×1000. The tests cover Close → suggestion → Not now → browsing, Explore → Sign up, Escape dismissal of video/suggestion/forms, visible close controls, remembered preference allowing direct browsing and exact spaced heading text at mobile widths.

Enrollment validation remains: 01 contact details and gender; 02 DOB/residence address/civil status/business goal; 03 Level Up background, complete gender/civil status and dummy documents. The script verifies dummy file type checks, accepted mock acknowledgement and cleared document selection. Fourteen unit/asset/contrast test groups cover adapter errors, dates, fields and original artwork integrity.

Actual video/captions, screen-reader and physical-device QA remain pending; no live applicant data or ID files are used. Real privacy/consent, AIA brand approval and public-copy cleanup remain prelaunch items. No backend, merge or deployment is included.

## Current video and signup behavior — Issue #22 review

The owner review relayed in https://github.com/nmatunog/NEXO/issues/22#issuecomment-6527125465 supersedes the earlier hard signup gate. The film fills the viewport. Close, Explore, Escape or video completion returns to the page and shows a non-modal **“Sign up to proceed and explore?”** suggestion. Sign up opens a simple form; Not now, close or Escape dismisses the suggestion. Signup forms have visible close controls and dismiss with Escape. Browsing and existing invitation CTAs stay available without registration or diagnostic. A video preference never forces signup on a return visit.

Three benefit headings preserve word spacing when their line breaks are hidden at phone widths, including 470px. Both the simple signup and later invitation form keep close buttons visible while scrolling. This remains an in-memory mock with no human-verification claim, live applicant persistence or real document upload. Before launch, real-data privacy/consent, AIA brand/compliance approval and public-copy cleanup remain pending.
