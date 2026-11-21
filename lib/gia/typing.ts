/** Pixie: ≥400ms typing dots before a deterministic reply; skip under reduced motion. */
export const GIA_TYPING_MS = 400;

export function typingDelayMs(reducedMotion = false) {
  return reducedMotion ? 0 : GIA_TYPING_MS;
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
