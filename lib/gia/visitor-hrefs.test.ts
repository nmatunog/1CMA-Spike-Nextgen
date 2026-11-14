import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { AboutAiaCareer } from '@/components/spike-preview/AboutAiaCareer';
import { GiaCitation } from '@/components/gia/GiaCitation';
import { AIA_REF_JOIN, AIA_REF_PARTNER } from '@/lib/gia/aia-career-copy';
import {
  SYNTHETIC_RECRUITER_REGISTRATION_URL,
} from '@/lib/gia/recruiter-registration';
import {
  blockedVisitorHrefs,
  hrefsFromHtml,
  isGenericAiaJoinHref,
  visitorSafeHref,
} from '@/lib/gia/visitor-hrefs';

const GENERIC_JOIN = AIA_REF_JOIN;
const IRECRUIT = 'https://irecruit.aia.com.ph/login';

describe('visitor href guard', () => {
  it('allows only local paths or approved HTTPS AIA pages, never governance or unsafe destinations', () => {
    for (const href of [
      'https://github.com/nmatunog/NEXO/issues/27',
      'https://github.com/nmatunog/1CMA-Spike-Nextgen/pull/13',
      'javascript:alert(1)', 'data:text/html,hello', 'http://www.aia.com.ph/en',
      '//evil.example/path', '/\\evil.example/path', 'https://www.aia.com.ph.evil.example/en',
      'https://user:password@www.aia.com.ph/en', 'https://www.aia.com.ph:444/en',
    ]) expect(visitorSafeHref(href)).toBeNull();
    expect(visitorSafeHref('/gia/privacy')).toBe('/gia/privacy');
    expect(visitorSafeHref(AIA_REF_PARTNER)).toBe(AIA_REF_PARTNER);
  });

  it('renders an internal governance citation as plain text', () => {
    const html = renderToStaticMarkup(createElement(GiaCitation, {
      citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://github.com/nmatunog/NEXO/issues/27' },
    }));
    expect(html).toContain('KP-LIT-01 · v0.2');
    expect(hrefsFromHtml(html)).toEqual([]);
  });
  it('blocks generic join-us-now and iRecruit from becoming visitor hrefs', () => {
    expect(visitorSafeHref(GENERIC_JOIN)).toBeNull();
    expect(visitorSafeHref(`${GENERIC_JOIN}?reference=`)).toBeNull();
    expect(visitorSafeHref(IRECRUIT)).toBeNull();
    expect(isGenericAiaJoinHref(GENERIC_JOIN)).toBe(true);
    expect(visitorSafeHref(SYNTHETIC_RECRUITER_REGISTRATION_URL)).toBe(SYNTHETIC_RECRUITER_REGISTRATION_URL);
    expect(visitorSafeHref(AIA_REF_PARTNER)).toBe(AIA_REF_PARTNER);
    expect(visitorSafeHref('/gia/privacy')).toBe('/gia/privacy');
    expect(blockedVisitorHrefs([GENERIC_JOIN, SYNTHETIC_RECRUITER_REGISTRATION_URL, IRECRUIT, AIA_REF_PARTNER])).toEqual([
      GENERIC_JOIN,
      IRECRUIT,
    ]);
  });

  it('renders About AIA sources as plain text without generic join-us-now hrefs', () => {
    const html = renderToStaticMarkup(createElement(AboutAiaCareer));
    expect(html).toContain('About the AIA advisor career');
    expect(html).toContain('AIA Philippines FAQs (reference)');
    expect(html).toContain('AIA Philippines public overview (reference)');
    expect(html).not.toMatch(/<a\b/i);
    expect(hrefsFromHtml(html)).toEqual([]);
    expect(blockedVisitorHrefs(hrefsFromHtml(html))).toEqual([]);
    expect(html).not.toMatch(/href=["'][^"']*join-us-now/i);
    expect(html).not.toMatch(/irecruit/i);
  });

  it('renders GIA join-AIA citation as plain text when source is generic join-us-now', () => {
    const html = renderToStaticMarkup(
      createElement(GiaCitation, {
        citation: { id: 'KP-REC-01', version: '0.3', source: GENERIC_JOIN },
      }),
    );
    expect(html).toContain('KP-REC-01 · v0.3');
    expect(html).not.toMatch(/<a\b/i);
    expect(hrefsFromHtml(html)).toEqual([]);
    expect(blockedVisitorHrefs(hrefsFromHtml(html))).toEqual([]);
  });

  it('renders GIA citation as a non-join public AIA page when source is partner-with-the-best', () => {
    const html = renderToStaticMarkup(
      createElement(GiaCitation, {
        citation: { id: 'KP-REC-03', version: '0.1', source: AIA_REF_PARTNER },
      }),
    );
    expect(html).toContain('KP-REC-03 · v0.1');
    expect(hrefsFromHtml(html)).toEqual([AIA_REF_PARTNER]);
    expect(blockedVisitorHrefs(hrefsFromHtml(html))).toEqual([]);
    expect(html).not.toMatch(/join-us-now|irecruit/i);
  });
});
