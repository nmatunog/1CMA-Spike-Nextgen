// Shipping Knowledge Pack. KP-LIT-*, KP-FEP-*, KP-DOCS-*, KP-SAFETY-*, and
// KP-REC-* may be approved and served. Modular domains: MVP 01 serves
// financial-literacy, fep, documents, safety, and recruitment (AIA advisor
// path only). Safety is served to every program. Interns and RA-SPIKE stay
// stubs/drafts. Keyed by (id, version).
import { entries as literacy } from './domains/financial-literacy.mjs';
import { entries as fep } from './domains/fep.mjs';
import { entries as recruitment } from './domains/recruitment.mjs';
import { entries as interns } from './domains/interns.mjs';
import { entries as raSpike } from './domains/ra-spike.mjs';
import { entries as documents } from './domains/documents.mjs';
import { entries as safety } from './domains/safety.mjs';

export const entries = [
  ...literacy,
  ...fep,
  ...recruitment,
  ...interns,
  ...raSpike,
  ...documents,
  ...safety,
];
