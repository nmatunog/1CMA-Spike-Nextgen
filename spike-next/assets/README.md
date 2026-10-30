# Official supplied assets

Received in `SPIKE_NEXT_v4_CODEX_HANDOFF.zip`:

- `SPIKE_logo_original.png` — original SPIKE artwork, retained unchanged.
- `SPIKE_logo_dark_variant.png` — supplied dark-background treatment; used on dark brand plates in both themes.
- `1CMA_logo.png` — supplied 1 Matunog District artwork; contained on a dark plate to preserve its white lettering.
- `Versa_logo.png` — supplied blue wordmark; subtle “Powered by Versa” footer.

The files are byte-identical to the ZIP; verify with `manifest.json` or `npm test`. No artwork filters, recoloring, cropping or substitute logos. Source aspect ratios are preserved with `object-fit: contain`.

The ZIP has no video, poster or captions. Those remain configurable in `src/config.js` and the current UI labels the missing video clearly. No remote stock footage is presented as SPIKE/1CMA media.
