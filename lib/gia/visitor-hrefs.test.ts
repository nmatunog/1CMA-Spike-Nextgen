import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { AboutAiaCareer } from '@/components/spike-preview/AboutAiaCareer';
import { GiaCitation } from '@/components/gia/GiaCitation';
import { RegisterWithRecruiter } from '@/components/gia/RegisterWithRecruiter';
import { AIA_REF_JOIN, AIA_REF_PARTNER } from '@/lib/gia/aia-career-copy';
import {
  SYNTHETIC_RECRUITER_REGISTRATION_URL,
  AIA_JOIN_HOST,
  AIA_JOIN_PATH,
  resolveRecruiterCta,
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

  it('blocks encoded generic registration and iRecruit paths, including nested encodings', () => {
    for (const href of [
      'https://www.aia.com.ph/en/financialadvisor/join%2Dus%2Dnow',
      'https://www.aia.com.ph/%69recruit', '/%69recruit',
      '/join%252Dus%252Dnow', '/%2569recruit', '/%5cevil.example', '/broken%zz',
    ]) {
      expect(visitorSafeHref(href), href).toBeNull();
      const html = renderToStaticMarkup(createElement(GiaCitation, {
        citation: { id: 'KP-REC-01', version: '0.3', source: href },
      }));
      expect(hrefsFromHtml(html), href).toEqual([]);
    }
  });

  it('hides internal governance citation metadata', () => {
    const html = renderToStaticMarkup(createElement(GiaCitation, {
      citation: { id: 'KP-LIT-01', version: '0.2', source: 'https://github.com/nmatunog/NEXO/issues/27' },
    }));
    expect(html).toBe('');
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

  it('hides citation metadata when source is generic join-us-now', () => {
    const html = renderToStaticMarkup(
      createElement(GiaCitation, {
        citation: { id: 'KP-REC-01', version: '0.3', source: GENERIC_JOIN },
      }),
    );
    expect(html).toBe('');
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
    expect(html).toContain('Source');
    expect(html).not.toContain('KP-REC-03');
    expect(hrefsFromHtml(html)).toEqual([AIA_REF_PARTNER]);
    expect(blockedVisitorHrefs(hrefsFromHtml(html))).toEqual([]);
    expect(html).not.toMatch(/join-us-now|irecruit/i);
  });
});

describe('LOW-N1 valid percent encoding without traversal', () => {
  it.each([
    '/gia/Financial%20Literacy',
    '/gia/privacy?topic=Financial%20Literacy',
    'https://www.aia.com.ph/en/Financial%20Literacy',
    'https://www.aia.com.ph/en/about?topic=Financial%20Literacy',
    '/gia/%E2%9C%93',
    '/gia/report%2Epdf',
  ])('accepts a safe encoded destination: %s', href => {
    expect(visitorSafeHref(href)).toBe(href);
  });
  it.each([
    '/gia/%00', '/gia/%09', '/gia/%0a', '/gia/%0d', '/gia/%1f', '/gia/%7f',
    '/gia/%250a', '/%2fevil.example', '/%252Fevil.example', '/gia/%5cfoo',
    '/gia/%255cfoo', '/gia/%2e%2e/private', '/gia/.%2e/private',
    '/gia/%252e%252e/private', '/gia/%2e/private', '/gia/../private',
    '/gia/%2F..%2Fprivate', '/broken%zz',
    '/join%2dus%2dnow', '/%69recruit', '/%2569recruit',
    'https://www.aia.com.ph/en/financialadvisor/join-us-now?topic=hello%20there',
  ])('rejects unsafe or prohibited encoded destinations: %s', href => {
    expect(visitorSafeHref(href)).toBeNull();
  });
});


describe('M1 attributed references retain query encoding', () => {
  // Synthetic all-zero codes only: the requested slash fixture plus a / and + variant.
  const reference = Buffer.from('{"code":"000000000","name":"TEST?RECRUITER>>"}').toString('base64');
  const withPlus = Buffer.from('{"code":"000000000","name":"TEST?RECRUITER>>>"}').toString('base64');
  const hrefs = [reference, withPlus].flatMap(value => [value, encodeURIComponent(value)]).map(value =>
    `https://${AIA_JOIN_HOST}${AIA_JOIN_PATH}?reference=${value}`);

  it('uses an all-zero synthetic reference that reproduces the encoded slash', () => {
    expect(JSON.parse(Buffer.from(reference, 'base64').toString()).code).toBe('000000000');
    expect(reference).toContain('/');
    expect(JSON.parse(Buffer.from(withPlus, 'base64').toString()).code).toBe('000000000');
    expect(withPlus).toContain('/');
    expect(withPlus).toContain('+');
    expect(encodeURIComponent(reference)).toContain('%2F');
  });
  it.each(hrefs)('allows raw or encoded attributed query reference: %s', href => {
    expect(visitorSafeHref(href)).toBe(href);
    expect(blockedVisitorHrefs([href])).toEqual([]);
  });
  it.each(hrefs)('renders RegisterWithRecruiter as a real link: %s', href => {
    const html = renderToStaticMarkup(createElement(RegisterWithRecruiter, {
      cta: resolveRecruiterCta({ consented: true, program: 'recruit', defaultUrl: href, defaultName: 'TEST?RECRUITER>>' }),
      contact: null,
    }));
    expect(html).toMatch(/<a\b/);
    expect(hrefsFromHtml(html)).toEqual([href]);
    expect(html).toContain('Register with your recruiter');
  });
  it('allows an encoded slash in an ordinary public AIA query', () => {
    const href = 'https://www.aia.com.ph/en/x?y=a%2Fb';
    expect(visitorSafeHref(href)).toBe(href);
  });
  it.each([
    '/gia/..', '/gia/../login', '/gia/%2e%2e/login', '/gia/.%2e/login',
    '/gia/%252e%252e/login', '/gia/%2e%2e%2flogin', '/gia/%252f..',
    '/gia/./x', '/a/%5c..', 'https://www.aia.com.ph/../x',
    'https://www.aia.com.ph/en/%2e%2e/irecruit',
    'https://www.aia.com.ph/en/a%2Fb', '//evil.example/x', '/%2fevil.example',
    `https://${AIA_JOIN_HOST}${AIA_JOIN_PATH}`, `https://${AIA_JOIN_HOST}${AIA_JOIN_PATH}?reference=`,
    '/gia/%3fkeep%252f..', '/gia/%23keep%252f..',
  ])('still blocks path traversal, encoded separators and generic registration: %s', href => {
    expect(visitorSafeHref(href)).toBeNull();
  });
});
