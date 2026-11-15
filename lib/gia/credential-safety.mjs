// Storage checks are intentionally broader than conversational refusals. A
// harmless account question may be discarded without refusing the visitor.
const CREDENTIAL = /\b(?:passwords?|pasword|passwrod|passwd|passcode|pass|pw|pwd|credentials?|creds|username|user[ -]?name|login|log[ -]?in|secret(?:\s+word)?|contrasena|kontrasenyas?)\b/;
const ACCOUNT_HELP = /\b(?:passwords?|pasword|passwrod|passwd|passcode|pw|pwd|credentials?|creds|username|user[ -]?name|login|log[ -]?in|secret(?:\s+word)?)\b/;
const AIA = /\b(?:aia|irecruit)\b/;
// A small security skeleton for common Cyrillic/Greek ASCII look-alikes. This
// only classifies input; it never rewrites displayed or persisted visitor text.
const LOOKALIKES = { а: 'a', е: 'e', і: 'i', о: 'o', р: 'p', с: 'c', ѕ: 's', у: 'y', х: 'x', α: 'a', ο: 'o', ρ: 'p', ι: 'i' };
function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[аеіорсѕухαορι]/g, char => LOOKALIKES[char])
    .replace(/’/g, "'")
    .replace(/\ba[.\s]*i[.\s]*a\b/g, 'aia')
    .replace(/\b(aia|irecruit)(?=password|pasword|passwrod|pass|pw|pwd|username|login|secret|creds|credential|account)/g, '$1 ');
}
function accountPair(text) {
  return /\b(?:aia|irecruit)(?:\s+(?:account|login|credentials?))?\s*[:=]\s*\S+\s*[/|]\s*\S+/.test(text)
    || (AIA.test(text) && /\baccount\b\s*(?::|=|is\b)\s*\S+\s*[/|]\s*\S+/.test(text));
}
function hasValue(tail) {
  const token = tail.trim().replace(/^["']/, '').split(/\s+/)[0];
  if (!token || !/[\p{L}\p{N}]/u.test(token)) return false;
  // These describe an account or a question, not an assigned credential value.
  return !/^(?:required|needed|necessary|optional|secure|safe|working|isn't|is|not|page|after|before|for|from|with|to|sa|ko|reset|help|available|doesn't|isn’t)\b/.test(token);
}
export function mayContainAiaCredentials(value) {
  const text = normalized(value);
  return accountPair(text) || (AIA.test(text) && (CREDENTIAL.test(text) || /\baccount\b/.test(text)));
}
export function isAiaCredentialDump(value) {
  const text = normalized(value);
  if (!mayContainAiaCredentials(text)) return false;
  if (accountPair(text)) return true;
  if (/^(?:please )?log ?in to (?:my )?irecruit\b.*\bwith this password\b/.test(text)) return true;
  const pairedFields = text.match(/\b(?:username|user name)\s+(\S+)\s+(?:password|passwd|pass)\s+(\S+)/);
  if (pairedFields && hasValue(pairedFields[1]) && hasValue(pairedFields[2])) return true;
  for (const credential of text.matchAll(new RegExp(CREDENTIAL.source, 'g'))) {
    const tail = text.slice(credential.index + credential[0].length).trim();
    const assignmentTail = tail.replace(/^(?:(?:ko|akong|nako|sa|aia|irecruit|ang|my)\s+){1,6}/, '');
    const assignment = assignmentTail.match(/^(?::|=)\s*(.*)$|^(?:is|kay|ay)\s+(.*)$/);
    if (assignment && hasValue(assignment[1] ?? assignment[2])) return true;
    // Preserve explicitly supplied bare forms such as "iRecruit pass mangoes".
    // Do not interpret arbitrary words after login/username as a secret.
    const prefix = text.slice(0, credential.index);
    if (!/[?]/.test(text) && !/^(?:login|log[ -]?in|username|user[ -]?name)$/.test(credential[0])
        && /\b(?:aia|irecruit)\s+$/.test(prefix) && hasValue(tail)) return true;
  }
  // An explicit presentation of credentials is refused even if its value is
  // absent. Ordinary questions and troubleshooting have no such presentation.
  return /\b(?:here(?:'s| is) my|use this|this is my)\b/.test(text) && CREDENTIAL.test(text);
}
export function isAccountHelpQuery(value) {
  return ACCOUNT_HELP.test(normalized(value));
}
export function isAiaAccountQuestion(value) {
  const text = normalized(value);
  return AIA.test(text) && ACCOUNT_HELP.test(text) && !isAiaCredentialDump(text);
}
