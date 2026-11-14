import {
  AIA_JOIN_HOST,
  AIA_JOIN_PATH,
  sanitizeAttributedRecruiterUrl,
} from '@/lib/gia/recruiter-registration';

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

function decodedForInspection(value: string): string | null {
  let decoded = value;
  for (let i = 0; i < 8; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch { return null; }
  }
  return null;
}

export function isIrecruitHref(href: string) {
  const decoded = decodedForInspection(href);
  return decoded == null || /irecruit/i.test(decoded);
}

export function isGenericAiaJoinHref(href: string) {
  const value = String(href || '').trim();
  if (!value) return false;
  if (sanitizeAttributedRecruiterUrl(value)) return false;
  const decoded = decodedForInspection(value);
  if (decoded == null || /join-us-now/i.test(decoded)) return true;
  try {
    const parsed = new URL(value, `https://${AIA_JOIN_HOST}`);
    return parsed.hostname === AIA_JOIN_HOST && normalizePath(parsed.pathname) === AIA_JOIN_PATH;
  } catch {
    return false;
  }
}

/** Only root-relative local links and HTTPS AIA public pages are visitor destinations. */
export function visitorSafeHref(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  // Backslashes/control characters can make browser URL parsing change the origin.
  const decoded = decodedForInspection(value);
  if (decoded == null || /[\\\u0000-\u0020\u007f]/.test(decoded)) return null;
  if (isIrecruitHref(value)) return null;
  if (isGenericAiaJoinHref(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== AIA_JOIN_HOST) return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    const attributed = sanitizeAttributedRecruiterUrl(value);
    if (attributed) return attributed;
    return value;
  } catch {
    return null;
  }
}

export function hrefsFromHtml(html: string) {
  return [...String(html).matchAll(/\bhref=(["'])(.*?)\1/gi)].map((match) => match[2]);
}

export function blockedVisitorHrefs(hrefs: Array<string | null | undefined>) {
  return hrefs
    .map((href) => String(href || '').trim())
    .filter((href) => href.length > 0 && (isIrecruitHref(href) || isGenericAiaJoinHref(href)));
}
