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

/** Landing card uses C1's shared AIA field-order list. No extra PII is collected here. */
export function detailsForAiaRegistration(contact: ConsentedContact | null | undefined): AiaAssistedField[] {
  if (!contact) return [];
  return mapAssistedRegistrationFields({ name: contact.name, email: contact.email });
}

export function copyAllAiaDetails(rows: AiaAssistedField[]) {
  return rows.filter((row) => row.captured).map((row) => `${row.label}: ${row.value}`).join('\n');
}
