import {
  AIA_JOIN_HOST,
  AIA_JOIN_PATH,
  sanitizeAttributedRecruiterUrl,
} from '@/lib/gia/recruiter-registration';

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function isIrecruitHref(href: string) {
  return /irecruit/i.test(href);
}

export function isGenericAiaJoinHref(href: string) {
  const value = String(href || '').trim();
  if (!value) return false;
  if (sanitizeAttributedRecruiterUrl(value)) return false;
  if (/join-us-now/i.test(value)) return true;
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
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return null;
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
