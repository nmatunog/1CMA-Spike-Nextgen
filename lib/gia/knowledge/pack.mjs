// Shipping Knowledge Pack. Only KP-LIT-* and KP-FEP-* may be approved/served.
// Modular domains: MVP 01 serves financial-literacy and fep. Recruitment is
// active for orientation but has no approved copy. Interns, RA-SPIKE, and
// documents stay stubs/drafts. Keyed by (id, version).
import { entries as literacy } from './domains/financial-literacy.mjs';
import { entries as fep } from './domains/fep.mjs';
import { entries as recruitment } from './domains/recruitment.mjs';
import { entries as interns } from './domains/interns.mjs';
import { entries as raSpike } from './domains/ra-spike.mjs';
import { entries as documents } from './domains/documents.mjs';

export const entries = [
  ...literacy,
  ...fep,
  ...recruitment,
  ...interns,
  ...raSpike,
  ...documents,
];
