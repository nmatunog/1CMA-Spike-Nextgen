// Shared by deterministic responses and the transcript persistence boundary.
// Conservatively discard AIA credential-related text, including local-language
// disclosures, rather than trying to distinguish an ordinary-word password.
export function isAiaCredentialDump(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/\ba[.\s]*i[.\s]*a\b/g, 'aia');
  return /\b(aia|irecruit)\b/.test(text)
    && /\b(password|passwd|passcode|pw|pwd|credentials?|creds|username|user[ -]?name|login|log[ -]?in|contrasena|kontrasenyas?|passwords)\b/.test(text);
}
