import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { AIA_JOIN_ASK, AIA_PUBLIC_JOIN, AIA_PUBLIC_PARTNER } from '../../lib/gia/path-picker';

const DIR = 'docs/screenshots/spike-preview';
const AIA_TEXT =
  `AIA advisor path only — not intern or free-learner paths. 1 Free Financial Literacy. 2 Free FEP. 3 Register with your assigned AIA recruiter so credit is kept; AIA's official process is the system of record. 4 SPIKE Venture Studio. Never send AIA login credentials. SPIKE does not submit or confirm AIA applications. Public: ${AIA_PUBLIC_PARTNER} and ${AIA_PUBLIC_JOIN}.`;

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

    await page.getByRole('button', { name: 'AIA advisor path' }).click();
    await expect(page.getByText(/Find your path · 2 of 3/)).toBeVisible();
    await page.screenshot({ path: `${DIR}/path-picker-${width}.png` });

    await page.locator('#journey-block').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await expect(page.getByText('Register with your assigned AIA recruiter')).toBeVisible();
    await expect(page.getByText('With your recruiter')).toBeVisible();
    await expect(page.getByText(/not for interns or free learners/)).toBeVisible();
    await expect(page.getByText('SPIKE Venture Studio')).toBeVisible();
    await page.screenshot({ path: `${DIR}/journey-${width}.png` });

    await page.route('**/api/gia', async (route) => {
      const body = route.request().postDataJSON() as { action?: string; text?: string };
      await new Promise((r) => setTimeout(r, 1800));
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
          citation: join ? { id: 'KP-REC-01', version: '0.2', source: 'https://github.com/nmatunog/NEXO/issues/32#issuecomment-6857443390' } : undefined,
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
    await expect(dock.getByText(/Register with your assigned AIA recruiter/)).toBeVisible({ timeout: 8_000 });
    const jump = dock.getByRole('button', { name: /New message/ });
    if (await jump.isVisible().catch(() => false)) await jump.click();
    await dock.getByText(/Register with your assigned AIA recruiter/).scrollIntoViewIfNeeded();
    await dock.screenshot({ path: `${DIR}/aia-register-${width}.png` });

    await dock.getByRole('button', { name: 'STOP / opt out' }).click();
    await expect(dock.getByText(/opted out/i)).toBeVisible();
    await dock.getByText(/opted out/i).scrollIntoViewIfNeeded();
    await dock.screenshot({ path: `${DIR}/stop-${width}.png` });
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
