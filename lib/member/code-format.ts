/** Partner format is not approved yet. This adapter does not verify inventory. */
export interface CodeFormat { normalize(value: string): string | null }
export const syntheticCodeFormat: CodeFormat = {
  normalize(value) { return /^(FREE|PRO)-[A-Z0-9]{8}$/i.test(value) ? value.toUpperCase() : null; },
};
