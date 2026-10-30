# v4 baseline alignment

Source: owner-uploaded `SPIKE_NEXT_v4_CODEX_HANDOFF.zip`. Supplied HTML is archived unchanged as text in `reference/spike_next_video_first_v4.html.txt`. SHA-256 manifest covers it and all four PNG originals. The archive README describes the supplied baseline and brand files; the task scope and claim corrections remain governed by the user's request and NEXO #22/#21.

| Baseline element | Implementation |
| --- | --- |
| Obsidian, SPIKE red, 1CMA gold | Restored across hero, cards, controls, section surfaces and accents; brighter text accents/borders meet contrast tests. |
| SPIKE + 1CMA masthead | Actual supplied raster artwork replaces hand-drawn symbols. SPIKE dark treatment sits on a dark brand plate in both themes. 1CMA uses a dark plate to preserve original white lettering. |
| “Build Your Enterprise. Own Your Future.” cinematic hero | Preserved heading, gateway badge, supporting copy and two primary actions. Dark in both themes. Unsupported MDRT/100% infrastructure claims replaced with pathway/agency facts. |
| Three free-entry invitations | Preserved preview, literacy sessions and SPIKE / RA-SPIKE program invitation, with later-cost/eligibility qualification. Demo CTA avoids claiming a live reservation. |
| Three audience lanes | Preserved Corporate Pivot, Family Enterprise and Launchpad composition. Descriptions retain exploration and transferable skills; no equity, exam sponsorship or schedule guarantees. Audience photography is explicitly labeled as pending, not misrepresented stock. |
| Optional diagnostic | Three-answer preference guide in a responsive panel; every answer contributes. No personality/fit score or guaranteed match. Direct signup always available. |
| Integrated SPIKE / RA-SPIKE program | Six stages: Discover, Explore, Develop, Build, Lead, Enterprise. Responsive grid with keyboard-operable native disclosure controls. Requirements and advancement are conditional, not promised. |
| Technology / Versa section | Preserves the technology-collaboration section's two-column composition. Fictitious telemetry, portal capabilities, live dispatch and bank-grade security claims removed. Versa acknowledgement uses actual wordmark subtly in footer. |
| 1CMA Cebu agency hub | Preserved agency section; actual logo replaces unverifiable executive-suite stock photo. Removed unverified leader credentials, promotional rankings and guaranteed outcomes. |
| Closing invitation + mobile CTA | Preserved “Build What’s Next,” direct preview action and persistent mobile signup. |
| Intro popup / theme / progressive signup | Accessible native dialogs, full-device-width video entry with simple “Sign up & explore” demo form, persistent theme/entry-completion preferences, two-step invitation signup and acknowledged mock responses. The signup-first, full-width entry follows the owner’s subsequent direction rather than the original Close/Skip presentation. |

The production UI uses semantic HTML, local CSS and ES modules, rather than the prototype's Tailwind CDN, unpinned Lucide runtime and inline event handlers. System font fallbacks keep preview independent of third-party requests; exact Plus Jakarta Sans/Inter metrics are not claimed without licensed local font files. Native disclosure elements and visible controls improve keyboard access. No source prototype scripts execute in the review app.

## Media and brand limits

No real intro footage, poster, captions or audience/agency photography was supplied. The design therefore uses explicitly labeled media placeholders and the actual 1CMA artwork, avoiding the prototype's external stock media. This is a v4-based implementation with documented functional/content corrections, not a pixel-identical rendering of those stock-media areas. Final media, local fonts if desired and owner visual acceptance remain.

All four original PNGs are retained without pixel changes. The original SPIKE artwork has a large canvas and decorative element; the supplied dark treatment provides a readable navigation lockup on a dark plate. This choice avoids cropping or recoloring either supplied image. Final brand treatment is reviewable by the owner.


## Subsequent owner direction

The opening film now fills device width and dynamic viewport height, with a simple fictional name/email/demo-consent form in place of Close/Skip buttons. “Sign up & explore” requires an acknowledged mock response before opening the landing preview. Native Escape remains accessible. Later enrollment is progressive: 01 contact details and gender; 02 DOB, residence address, civil status and business goal; 03 background, development commitment and dummy ID/supporting-document selection. The initial entry does not collect those later fields or create a real portal account.

The owner retained the third card title as **Level Up**. The broader financial entrepreneurship pathway is explained in its description and enrollment fields. Licensing is a required gate before regulated advisory practice; development continues through professional practice and leadership.

The hero’s former three statistics were replaced with balanced explanatory journey cards: start with a free preview, develop through SPIKE / RA-SPIKE, and connect with 1CMA Cebu. Desktop cards have equal columns, consistent headings and short supporting copy; mobile stacks them without oversized acronym/statistic blocks.


## Full-screen video → required signup correction

The film now occupies the entire viewport rather than sharing height with the form. Overlay **Close** and **Explore** both close the film and automatically open a separate required simple signup dialog; Escape from the film and playback end take the same route. Escape/backdrop cannot bypass the signup dialog. A remembered video-completion preference shows signup directly on the next load rather than silently opening the portal. Only acknowledged mock signup opens the landing preview. This UI gate cannot capture anonymous visitors who leave, and actual signup persistence requires Versa’s API; no server authentication is implemented.

Browser checks assert the film’s x/y/width/height equal the viewport at six sizes; both actions route to signup; Escape on signup keeps it open; refresh cannot bypass it; rejected/offline results never open the portal. Mobile and desktop screenshots were inspected. The supplied handoff still contains no actual intro video/captions.
