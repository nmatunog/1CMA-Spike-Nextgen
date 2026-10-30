# Sprint 01 QA evidence

Executed 2026-10-30 on Node 24.19.0 and local Chromium via Python Playwright.

- `npm run check`: all three source modules parse.
- `npm test`: all three test files pass (nine individual test groups: two source/asset tests, five adapter/validation/reflection/attribution tests, two theme contrast tests). Also ran every test module directly to confirm all nine groups execute.
- `python3 tests/browser.py`: passed at 360×800, 390×844, 768×1024 and 1440×1000. Native dialog focus containment supplemented with explicit Tab wrapping; Escape/close focus return verified. Theme persistence, intro opt-out/manual reopen, audience prefill, reflection majority, form errors, acknowledged/rejected/offline states passed. No horizontal overflow; zero external requests, no POST requests, zero JavaScript errors.
- Reduced motion with localStorage denied: intro remains skippable, video paused, theme works in-session, and closing during submission cannot display a late acknowledgement on reopening.
- Only `spike-next-theme` and `spike-next-skip-intro` are stored; document cookie stays empty. Accepted demo clears name/email/consent.
- Both themes' text/muted/accent/error tokens exceed 4.5:1 on all solid surfaces; primary button text exceeds 4.5:1; control boundary tokens exceed 3:1. This token test does not certify every rendered pixel or final artwork.
- Inspected full-page mobile light and desktop dark screenshots locally for layout hierarchy and wrapping. Rechecked after v4 integration: cinematic hero, actual brand lockups, three invitation cards, audience lanes, diagnostic, pathway grid and agency/footer treatments.

## Pending

The approved v4 HTML and all four exact PNGs have now been integrated. Source/asset SHA-256 tests verify byte-for-byte integrity. Expanded Chromium checks assert the v4 hero heading, successful loading of every logo image, exact logo URLs and dark-brand-plate treatment in light mode. `docs/V4_ALIGNMENT.md` records visual/content adaptations. Actual video/captions, autoplay failure across Safari/iOS/Android, screen reader announcements and physical-device behavior remain to be checked with approved media and final owner styling review. No backend or production deployment was tested or performed. No full legacy Next.js build was run: it is outside the isolated subproject and its files are unchanged.
