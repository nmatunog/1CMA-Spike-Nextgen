import {
  mapAssistedRegistrationFields,
  type AiaAssistedField,
} from '@/lib/mvp01/aia-assisted-fields';

export type ConsentedContact = { name: string; email: string };
export type AiaDetailRow = AiaAssistedField;

export const SYNTHETIC_CONSENT_CONTACT: ConsentedContact = {
  name: 'Alex Rivera',
  email: 'alex.rivera@example.test',
};

/** Visitor-facing. C1's AIA_ASK_ON_FORM is staff copy and must not appear on the landing. */
export const AIA_FORM_FILL_HINT = "You'll fill this in on AIA's form";

/** Landing card uses C1's shared AIA field-order list. Name and email only — never phone or DOB. */
export function detailsForAiaRegistration(contact: ConsentedContact | null | undefined): AiaAssistedField[] {
  if (!contact) return [];
  return mapAssistedRegistrationFields({ name: contact.name, email: contact.email });
}

export function aiaDetailDisplay(row: AiaAssistedField) {
  if (row.captured) return { text: row.value, copyable: true };
  return { text: AIA_FORM_FILL_HINT, copyable: false };
}

export function copyAllAiaDetails(rows: AiaAssistedField[]) {
  return rows.filter((row) => row.captured).map((row) => `${row.label}: ${row.value}`).join('\n');
}
