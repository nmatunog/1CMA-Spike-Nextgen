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
// Keywords that name a secret (not merely an account). Used for refusals.
const SECRET_KEYWORD = /\b(?:passwords?|pasword|passwrod|passwd|passcode|pw|pwd|pin|contrasena|kontrasenyas?)\b/;
// Words that follow a credential keyword in an ordinary question, not a value.
const NOT_A_VALUE = /^(?:required|needed|necessary|optional|secure|safe|working|isn't|isnt|is|not|page|after|before|for|from|with|to|sa|ng|ko|reset|help|available|doesn't|doesnt|policy|rules?|strong|weak|change|changed|forgot|forget|nawala|lost|the|a|an|my|your|and|or|of|on|in|at|please|pls|po|kay|ay|ang|akong|nako|spike|fep|zoom|portal|login|log|account|learning|literacy|session|sign|signin|email|mail|site|app|system|ng|kay|ni|para|kasi|tapos|hindi|dili|di|wrong|incorrect|invalid|expired|expire|expiring|locked|blocked|mali|sayop|correct|right|case|too|very|still|already|same|different|new|old|temporary|ayaw|won't|wont|can't|cant|does|did|was|has|have|will|should|must|being|been|it|this|that|what|how|where|when|why|protected)$/;

function valueAfter(tail) {
  const token = tail.trim().replace(/^["'`]/, '').split(/\s+/)[0] || '';
  if (!/[\p{L}\p{N}]/u.test(token)) return false;
  return !NOT_A_VALUE.test(token.replace(/[.,!?;:]+$/, ''));
}

/** Text that assigns or presents a credential value, whether or not it names AIA. */
function presentsCredentialValue(text, keyword = CREDENTIAL, allowBare = true) {
  for (const match of text.matchAll(new RegExp(keyword.source, 'g'))) {
    const tail = text.slice(match.index + match[0].length);
    const rest = tail.replace(/^\s*(?:(?:ko|akong|nako|sa|ang|my|nimo|mo)\s+){0,4}/, '');
    const assigned = rest.match(/^\s*(?::|=|\s[-–—]\s|→|->|is\b|kay\b|ay\b)\s*(.*)$/);
    if (assigned && valueAfter(assigned[1])) return true;
    // Bare "password sunshine" / "username juan password mangoes" (no question).
    if (allowBare && !/[?]/.test(text) && !/^(?:pass|login|log[ -]?in)$/.test(match[0]) && valueAfter(rest)) return true;
  }
  return false;
}

function presentsCredentialPair(text) {
  // "juan / sunshine", "007123456 | sunshine", "x@y.com / sunshine"
  return /\S+\s*[/|]\s*\S+/.test(text)
    && (CREDENTIAL.test(text) || AIA.test(text) || AIA_USERNAME_NUMBER.test(text) || EMAIL.test(text));
}

/**
 * Storage guard: true when the message may carry any login secret or AIA
 * username, with or without "AIA". Deliberately broader than the refusal.
 */
export function mayContainCredentialValue(value) {
  const text = normalized(value);
  return mayContainAiaCredentials(text)
    || AIA_USERNAME_NUMBER.test(text)
    || presentsCredentialPair(text)
    || presentsCredentialValue(text);
}

/** Refusal: a secret value or an AIA username shape is being handed over. */
export function isCredentialDisclosure(value) {
  const text = normalized(value);
  if (isAiaCredentialDump(text)) return true;
  // Refuse only explicit assignments ("password: x", "password ko kay x") or a
  // username/password field pair; bare "password <word>" is only blanked from storage.
  if (presentsCredentialValue(text, SECRET_KEYWORD, false)) return true;
  if (/\b(?:username|user name|login|user)\s*:?\s+\S+\s+(?:passwords?|passwd|pw|pwd|pass)\s*:?\s+\S+/.test(text)) return true;
  // "login: juan / sunshine", "irecruit | juan | sunshine"
  if (new RegExp(`${CREDENTIAL.source}\\s*[:=]\\s*\\S+\\s*[/|]\\s*\\S+`).test(text)) return true;
  if (AIA.test(text) && /\S+\s*[/|]\s*\S+\s*[/|]\s*\S+/.test(text)) return true;
  if (AIA_USERNAME_NUMBER.test(text)
    && (presentsCredentialPair(text) || CREDENTIAL.test(text) || /\b007[\s-]?\d{3}[\s-]?\d{3,}\s+\S+/.test(text))) return true;
  return EMAIL.test(text) && (presentsCredentialPair(text) || SECRET_KEYWORD.test(text));
}

export function isAccountHelpQuery(value) {
  return ACCOUNT_HELP.test(normalized(value));
}
export function isAiaAccountQuestion(value) {
  const text = normalized(value);
  return AIA.test(text) && ACCOUNT_HELP.test(text) && !isAiaCredentialDump(text);
}
