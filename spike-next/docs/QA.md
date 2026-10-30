# Sprint 01 QA evidence

Executed 2026-10-30 on Node 24.19.0 and local Chromium via Python Playwright.

- `npm run check`: all three source modules parse.
- `npm test`: both test files pass (seven individual assertions groups: five adapter/validation/reflection/attribution tests, two theme contrast tests). Also ran each test module directly to confirm all seven test groups execute.
- `python3 tests/browser.py`: passed at 360×800, 390×844, 768×1024 and 1440×1000. Native dialog focus containment supplemented with explicit Tab wrapping; Escape/close focus return verified. Theme persistence, intro opt-out/manual reopen, audience prefill, reflection majority, form errors, acknowledged/rejected/offline states passed. No horizontal overflow; zero external requests, no POST requests, zero JavaScript errors.
- Reduced motion with localStorage denied: intro remains skippable, video paused, theme works in-session, and closing during submission cannot display a late acknowledgement on reopening.
- Only `spike-next-theme` and `spike-next-skip-intro` are stored; document cookie stays empty. Accepted demo clears name/email/consent.
- Both themes' text/muted/accent/error tokens exceed 4.5:1 on all solid surfaces; primary button text exceeds 4.5:1; control boundary tokens exceed 3:1. This token test does not certify every rendered pixel or final artwork.
- Inspected full-page mobile light and desktop dark screenshots locally for layout hierarchy and wrapping. Those show provisional styling, not an approved v4 comparison.

## Pending

Approved v4 HTML and exact logos were not available. Pixel/brand comparison cannot be completed. Actual video/captions, autoplay failure across Safari/iOS/Android, screen reader announcements and physical-device behavior remain to be checked with approved media and final styling. No backend or production deployment was tested or performed. No full legacy Next.js build was run: it is outside the isolated subproject and its files are unchanged.
