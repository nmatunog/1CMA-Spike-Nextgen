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
// AIA usernames are commonly an email address or a number starting with 007.
const AIA_USERNAME_NUMBER = /\b007[\s-]?\d{3}[\s-]?\d{3,}\b/;
const EMAIL = /\b[^\s@/|]+@[^\s@/|]+\.[a-z]{2,}\b/;
// Keywords that name a secret (not merely an account).
const SECRET_KEYWORD = /\b(?:passwords?|pasword|passwrod|passwd|passcode|pw|pwd|pin|contrasena|kontrasenyas?)\b/;
// Words between a keyword and its separator: "password ko po sa SPIKE kay x".
const FILLER = /^(?:\s+(?:ko|akong|nako|sa|ang|my|nimo|mo|po|ng|spike|aia|irecruit|fep|zoom|portal|account|login))+(?=[\s:=]|$)/;
// Explicit separators. " - " needs whitespace on both sides ("password-protected" is not one).
const SEPARATOR = /^(?:\s*(?:[:=→]|->)|\s+[-–—]\s|\s+(?:is|kay|ay)\b\s*:?)\s*/;
// REFUSAL ONLY. These never decide storage: any credential keyword is blanked.
const NOT_A_VALUE = /^(?:required|needed|necessary|optional|secure|safe|working|isn't|isnt|is|not|reset|help|available|doesn't|doesnt|strong|weak|changed|forgot|forgotten|lost|the|a|an|my|your|wrong|incorrect|invalid|expired|locked|blocked|correct|right|same|different|new|old|temporary|protected|supposed|blank|empty|none|unknown|nakalimutan|nalimtan|nawala|wala|gumagana|nagana|mali|sayop|ayaw|hindi|dili|di|ko|po|nako)$/;

/**
 * An explicit, single-token credential assignment: "password: x", "my password is: x",
 * "password ko po ay x", "password - x". The value must be one token that ends
 * the message or its clause, so "My password is 8 characters, is that ok?" or
 * "ang password ko ay nakalimutan ko" are not disclosures.
 */
function assignsSecret(text) {
  for (const match of text.matchAll(new RegExp(SECRET_KEYWORD.source, 'g'))) {
    let tail = text.slice(match.index + match[0].length);
    tail = tail.replace(FILLER, '');
    const separator = tail.match(SEPARATOR);
    if (!separator) continue;
    const value = tail.slice(separator[0].length).match(/^["'`]?([^\s"'`,.;!?]+)["'`]?\s*([,.;!]|\n|$)/);
    if (value && /[\p{L}\p{N}]/u.test(value[1]) && !NOT_A_VALUE.test(value[1])) return true;
  }
  return false;
}

/**
 * Storage guard: true when a message may carry a login secret or AIA username,
 * with or without "AIA". Any credential keyword is enough; no stop-list applies.
 */
export function mayContainCredentialValue(value) {
  const text = normalized(value);
  return mayContainAiaCredentials(text)
    || CREDENTIAL.test(text) || SECRET_KEYWORD.test(text)
    || AIA_USERNAME_NUMBER.test(text)
    || (EMAIL.test(text) && /[/|]/.test(text))
    || isCredentialDisclosure(text);
}

/** Refusal: an explicit secret value or an AIA username shape is being handed over. */
export function isCredentialDisclosure(value) {
  const text = normalized(value);
  if (isAiaCredentialDump(text)) return true;
  if (assignsSecret(text)) return true;
  // "username juan password mangoes", "user: 007123456 pass: x"
  if (/\b(?:username|user name|login|user)\s*:?\s+\S+\s+(?:passwords?|passwd|pw|pwd|pass)\s*:?\s+[^\s?]+\s*$/m.test(text)) return true;
  // "login: juan / sunshine"
  if (new RegExp(String.raw`${CREDENTIAL.source}\s*[:=]\s*[^\s/|]+\s*[/|]\s*[^\s/|?]+`).test(text)) return true;
  // "irecruit | juan | sunshine" as the whole message tail, not a question.
  if (!/[?]/.test(text) && /\b(?:aia|irecruit)\s*[/|]\s*[^\s/|]+\s*[/|]\s*[^\s/|]+\s*$/.test(text)) return true;
  // 007 username shapes: "007123456 / x", "007123456 x", or with a credential keyword.
  const number = AIA_USERNAME_NUMBER.source;
  if (new RegExp(String.raw`${number}\s*(?:[/|]\s*|\s+)\S`).test(text)
    || (AIA_USERNAME_NUMBER.test(text) && CREDENTIAL.test(text))) return true;
  // Email usernames: "x@y.com / secret", "x@y.com password secret", "email x@y.com pw: secret".
  const email = EMAIL.source;
  if (new RegExp(String.raw`${email}\s*[/|]\s*\S`).test(text)) return true;
  const pairedSecret = text.match(new RegExp(String.raw`${email}\s*[,;]?\s*(?:(?:my|and|ang|ko)\s+)*(?:${SECRET_KEYWORD.source})\s*(?:is\b|[:=])?\s*([^\s?,.;!]+)`));
  return !!pairedSecret && !NOT_A_VALUE.test(pairedSecret[1]);
}

export function isAccountHelpQuery(value) {
  return ACCOUNT_HELP.test(normalized(value));
}
export function isAiaAccountQuestion(value) {
  const text = normalized(value);
  return AIA.test(text) && ACCOUNT_HELP.test(text) && !isAiaCredentialDump(text);
}
