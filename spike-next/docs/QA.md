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


## Full-width opening video follow-up

The opening intro now fills the device width and dynamic viewport height. The owner then requested signup-first entry: Close/Skip/opt-out buttons are replaced by fictional name, demo email, explicit demo consent and “Sign up & explore.” Accepted response opens the landing page and stores only a completion preference; rejected/offline replies stay open, and stale responses after Escape cannot open it. Video/placeholder has no card gutters or rounded corners; playback uses `object-fit: contain` to preserve footage framing. Safe-area padding protects controls. Signup retains its separate dialog layout. Regression coverage now includes 320×568 and 844×390 landscape, plus the four original sizes; asserts intro/media edge-to-edge bounds and a reachable signup button, with no Close/Skip buttons. Small-height screens scroll within the entry; native Escape remains accessible.


## Progressive enrollment follow-up

Final owner-directed split: entry name/email; 01 contact/session details and gender; 02 fictional DOB/residence address/civil status plus a simple business goal; 03 background and dummy supporting documents. Gender/civil status offer Prefer not to say only in 01/02; 03 requires complete selections and neither field is a diagnostic input. Browser regression verifies the 02-specific fields, 03 background visibility, missing/unsupported dummy documents, accepted dummy PDF metadata and zero upload requests. Entry rejected/offline fixtures stay open; stale entry replies after Escape do not show acknowledgement. Unit tests cover invitation-specific validation, impossible/future birth dates, address requirements and unsupported/oversized/missing documents. No real PII/ID or file content was used.


## Hero summary refinement

Replaced the oversized ₱0 / SPIKE / 1CMA statistic strip with explanatory journey cards and equal desktop columns that stack on mobile. Desktop-dark/mobile-light screenshots inspected; full browser regression rerun with no horizontal overflow or interaction failures.


## Full-screen video → required signup correction

The film now occupies the entire viewport rather than sharing height with the form. Overlay **Close** and **Explore** both close the film and automatically open a separate required simple signup dialog; Escape from the film and playback end take the same route. Escape/backdrop cannot bypass the signup dialog. A remembered video-completion preference shows signup directly on the next load rather than silently opening the portal. Only acknowledged mock signup opens the landing preview. This UI gate cannot capture anonymous visitors who leave, and actual signup persistence requires Versa’s API; no server authentication is implemented.

Browser checks assert the film’s x/y/width/height equal the viewport at six sizes; both actions route to signup; Escape on signup keeps it open; refresh cannot bypass it; rejected/offline results never open the portal. Mobile and desktop screenshots were inspected. The supplied handoff still contains no actual intro video/captions.
