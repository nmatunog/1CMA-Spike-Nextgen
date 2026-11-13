import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { AIA_JOIN_ASK } from '../../lib/gia/path-picker';
import { SYNTHETIC_CONSENT_CONTACT } from '../../lib/gia/aia-registration-details';
import {
  RECRUITER_CTA_LABEL,
  SYNTHETIC_RECRUITER_DISPLAY_NAME,
} from '../../lib/gia/recruiter-registration';
import { blockedVisitorHrefs } from '../../lib/gia/visitor-hrefs';

async function hrefsIn(scope: Page | Locator) {
  return scope.locator('a[href]').evaluateAll((els) => els.map((el) => el.getAttribute('href') || ''));
}

const DIR = 'docs/screenshots/spike-preview';
const AIA_TEXT =
  "AIA advisor path only — not intern or free-learner paths. 1 Free Financial Literacy. 2 Free FEP. 3 Register only through your recruiter's attributed link so credit is kept; AIA's official process is the system of record. 4 SPIKE Venture Studio. Never send AIA login credentials. SPIKE does not submit or confirm AIA applications. Source: AIA Philippines, as of 14 Nov 2026.";

test('synthetic screenshots at 390 and 1440', async ({ page }) => {
  await mkdir(DIR, { recursive: true });
  for (const width of [390, 1440] as const) {
    const height = width === 390 ? 844 : 1100;
    await page.setViewportSize({ width, height });
    await page.goto('/spike-preview');
    await expect(page.getByRole('heading', { name: 'Ask GIA. Start free.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Free Financial Literacy' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Coming soon · not live' })).toBeVisible();
    await expect(page.getByText('Learning does not authorize you to sell insurance or give insurance advice.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message GIA' })).toBeVisible();
    await expect(page.getByText(/Find your path · 1 of 3/)).toBeVisible();
    const literacy = page.getByRole('heading', { name: 'Free Financial Literacy' });
    const box = await literacy.boundingBox();
    expect(box).toBeTruthy();
    if (width === 1440) expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
    else expect(box?.y ?? 0).toBeLessThan(height);
    await page.screenshot({ path: `${DIR}/landing-${width}.png` });
    expect(blockedVisitorHrefs(await hrefsIn(page))).toEqual([]);

    await page.getByRole('button', { name: 'AIA advisor path' }).click();
    await expect(page.getByText(/Find your path · 2 of 3/)).toBeVisible();
    await page.screenshot({ path: `${DIR}/path-picker-${width}.png` });

    await page.locator('#journey-block').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(page.getByText('Register with your recruiter').first()).toBeVisible();
    await expect(page.getByText('With your recruiter').first()).toBeVisible();
    await expect(page.getByText(/Step 3 is for the AIA advisor path/)).toBeVisible();
    await expect(page.getByText('SPIKE Venture Studio').first()).toBeVisible();
    await page.screenshot({ path: `${DIR}/journey-${width}.png` });

    await page.locator('#about-aia').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(page.getByRole('heading', { name: 'About the AIA advisor career' })).toBeVisible();
    await expect(page.getByText(/Based on AIA Philippines/)).toBeVisible();
    await expect(page.getByText('Photo coming soon').first()).toBeVisible();
    await expect(page.getByText(/AIA Philippines public overview \(reference\)/).first()).toBeVisible();
    await expect(page.locator('#about-aia a[href]')).toHaveCount(0);
    expect(blockedVisitorHrefs(await hrefsIn(page))).toEqual([]);
    await page.screenshot({ path: `${DIR}/about-aia-${width}.png` });

    await page.route('**/api/gia', async (route) => {
      const body = route.request().postDataJSON() as { action?: string; text?: string };
      await new Promise((r) => setTimeout(r, 1800));
      if (body?.action === 'consent') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      if (body?.action === 'opt_out') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ intent: 'opt_out', message: 'You have opted out. We will not contact you again from this preview.' }),
        });
        return;
      }
      const join = typeof body?.text === 'string' && /join aia|how do i register/i.test(body.text);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          intent: 'answer',
          text: join ? AIA_TEXT : "I'm GIA — Your 1CMA AI Guide.",
          citation: join ? { id: 'KP-REC-01', version: '0.3', source: 'https://www.aia.com.ph/en/financialadvisor/join-us-now' } : undefined,
        }),
      });
    });

    await page.getByRole('button', { name: 'Ask GIA', exact: true }).last().click();
    const dock = page.getByRole('dialog', { name: 'GIA guide' });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Close GIA' })).toBeVisible();
    await expect(dock.locator('h1')).toHaveText('GIA — Your 1CMA AI Guide');
    await dock.screenshot({ path: `${DIR}/gia-panel-${width}.png` });

    await expect(dock.getByRole('heading', { name: 'Save a contact for booking or leader follow-up' })).toBeVisible();
    await dock.getByRole('heading', { name: 'Save a contact for booking or leader follow-up' }).scrollIntoViewIfNeeded();
    await dock.screenshot({ path: `${DIR}/consent-card-${width}.png` });

    await dock.getByRole('button', { name: AIA_JOIN_ASK }).scrollIntoViewIfNeeded();
    await dock.getByRole('button', { name: AIA_JOIN_ASK }).click();
    await expect(dock.getByLabel('GIA is typing')).toBeVisible();
    await dock.getByLabel('GIA is typing').scrollIntoViewIfNeeded();
    await dock.screenshot({ path: `${DIR}/gia-typing-${width}.png` });
    await expect(dock.getByText(/attributed link/)).toBeVisible({ timeout: 8_000 });
    await expect(dock.getByText('KP-REC-01 · v0.3')).toBeVisible();
    await expect(dock.getByRole('link', { name: /KP-REC-01/ })).toHaveCount(0);
    await expect(dock.getByText(/join-us-now|partner-with-the-best/)).toHaveCount(0);
    expect(blockedVisitorHrefs(await hrefsIn(dock))).toEqual([]);
    expect(blockedVisitorHrefs(await hrefsIn(page))).toEqual([]);
    const jump = dock.getByRole('button', { name: /New message/ });
    if (await jump.isVisible().catch(() => false)) await jump.click();
    await dock.getByText(/attributed link/).scrollIntoViewIfNeeded();
    await dock.screenshot({ path: `${DIR}/aia-register-${width}.png` });

    await dock.getByLabel('Name').fill(SYNTHETIC_CONSENT_CONTACT.name);
    await dock.getByLabel('Email').fill(SYNTHETIC_CONSENT_CONTACT.email);
    await dock.getByRole('checkbox').check();
    await dock.getByRole('button', { name: 'Save consent and contact' }).click();
    await expect(dock.getByRole('heading', { name: 'Your details for AIA registration' })).toBeVisible();
    await expect(dock.getByText('Honorifics')).toBeVisible();
    await expect(dock.getByText(/first name/i)).toBeVisible();
    await expect(dock.getByText('Alex', { exact: true })).toBeVisible();
    await expect(dock.getByText(/last name/i)).toBeVisible();
    await expect(dock.getByText('Rivera', { exact: true })).toBeVisible();
    await expect(dock.getByText('Date of Birth')).toBeVisible();
    await expect(dock.getByText(SYNTHETIC_CONSENT_CONTACT.email)).toBeVisible();
    await expect(dock.getByText("I'm Applying To Be")).toBeVisible();
    await expect(dock.getByText('Preferred Location')).toBeVisible();
    await expect(dock.getByText("You'll fill this in on AIA's form").first()).toBeVisible();
    await expect(dock.getByText('639XXXXXXXXX')).toBeVisible();
    await expect(dock.getByText('Mr / Miss / Mrs')).toBeVisible();
    await expect(dock.getByText('Full Time / Part Time')).toBeVisible();
    await expect(dock.getByText(/ask the candidate/i)).toHaveCount(0);
    await expect(dock.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(3);
    await expect(dock.getByRole('button', { name: 'Copy all' })).toBeVisible();
    await expect(dock.locator('input[type="date"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Close GIA' }).click();
    await page.locator('#journey-block').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(page.getByRole('link', { name: RECRUITER_CTA_LABEL })).toBeVisible();
    expect(blockedVisitorHrefs(await hrefsIn(page))).toEqual([]);
    await expect(page.getByText(`Your recruiter, ${SYNTHETIC_RECRUITER_DISPLAY_NAME}, will be with you on AIA's form`)).toBeVisible();
    await expect(page.getByText("This opens AIA's official registration with your recruiter.")).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your details for AIA registration' })).toBeVisible();
    const detailsCard = page.getByTestId('aia-registration-details');
    await page.setViewportSize({ width, height: width === 390 ? 1600 : 1400 });
    await detailsCard.screenshot({ path: `${DIR}/copy-details-${width}.png` });
    await page.setViewportSize({ width, height });
    await page.locator('#journey-block').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${DIR}/recruiter-cta-${width}.png` });

    await page.getByRole('button', { name: 'Ask GIA', exact: true }).last().click();
    const dockAgain = page.getByRole('dialog', { name: 'GIA guide' });
    await dockAgain.getByRole('button', { name: 'STOP / opt out' }).click();
    await expect(dockAgain.getByText(/opted out/i)).toBeVisible();
    await dockAgain.getByText(/opted out/i).scrollIntoViewIfNeeded();
    await dockAgain.screenshot({ path: `${DIR}/stop-${width}.png` });
    await page.getByRole('button', { name: 'Close GIA' }).click();
    await page.unroute('**/api/gia');

    await page.setViewportSize({ width, height: width === 390 ? 1200 : 1400 });
    await page.goto('/gia');
    await expect(page.getByRole('heading', { name: 'GIA — Your 1CMA AI Guide' })).toBeVisible();
    await expect(page.getByText('Learning does not authorize you to sell insurance or give insurance advice.')).toBeVisible();
    await page.getByRole('heading', { name: 'Save a contact for booking or leader follow-up' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/gia-page-${width}.png`, fullPage: true });
  }
});
