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

/** Clickable visitor href, or null. Generic join-us-now and iRecruit never pass. */
export function visitorSafeHref(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (isIrecruitHref(value)) return null;
  const attributed = sanitizeAttributedRecruiterUrl(value);
  if (attributed) return attributed;
  if (isGenericAiaJoinHref(value)) return null;
  return value;
}

export function hrefsFromHtml(html: string) {
  return [...String(html).matchAll(/\bhref=(["'])(.*?)\1/gi)].map((match) => match[2]);
}

export function blockedVisitorHrefs(hrefs: Array<string | null | undefined>) {
  return hrefs
    .map((href) => String(href || '').trim())
    .filter((href) => href.length > 0 && (isIrecruitHref(href) || isGenericAiaJoinHref(href)));
}
