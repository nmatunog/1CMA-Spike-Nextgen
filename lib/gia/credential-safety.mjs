// Storage is deliberately more conservative than conversational refusal: a
// credential-related question can receive guidance without retaining its text.
const CREDENTIAL = /\b(?:passwords?|pasword|passwrod|passwd|passcode|pass|pw|pwd|credentials?|creds|username|user[ -]?name|login|log[ -]?in|contrasena|kontrasenyas?)\b/;
function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\ba[.\s]*i[.\s]*a\b/g, 'aia');
}
function accountPair(text) {
  return /\b(?:aia|irecruit)\b/.test(text)
    && /\baccount\b\s*(?::|=|is\b)\s*\S+\s*[/|]\s*\S+/.test(text);
}
export function mayContainAiaCredentials(value) {
  const text = normalized(value);
  return accountPair(text) || (/\b(?:aia|irecruit)\b/.test(text) && (CREDENTIAL.test(text) || /\baccount\b/.test(text)));
}
export function isAiaCredentialDump(value) {
  const text = normalized(value);
  if (!mayContainAiaCredentials(text)) return false;
  if (accountPair(text)) return true;
  const credentials = [...text.matchAll(new RegExp(CREDENTIAL.source, 'g'))];
  if (!credentials.length) return false;
  // Inspect every label: a harmless login question can precede a disclosure.
  for (const credential of credentials) {
    const tail = text.slice(credential.index + credential[0].length).trim();
    if (/^(?::|=|is\b|kay\b|ay\b)\s*\S+/.test(tail)
        && !/^(?:is\s+)?(?:required|needed|necessary|optional)\b/.test(tail)) return true;
  }
  if (/\b(?:where|how|what|do i need|will i need|should i|can i|is .{0,30}(?:required|needed)|forgot|reset)\b/.test(text)) return false;
  if (/\b(?:here(?:'s| is)|use this|this is my|my\s+(?:aia|irecruit)\s+(?:password|pasword|pass|login|username))\b/.test(text)) return true;
  const first = credentials[0];
  return !!text.slice(first.index + first[0].length).trim() || /\b(?:my|ko|akong)\b/.test(text);
}
export function isAiaAccountQuestion(value) {
  const text = normalized(value);
  return /\b(?:password|pasword|passwrod|passwd|passcode|pw|pwd|credentials?|creds|username|user[ -]?name|login|log[ -]?in)\b/.test(text)
    && /\b(?:where|how|what|do i need|will i need|should i|can i|is .{0,30}(?:required|needed)|forgot|reset)\b/.test(text);
}
