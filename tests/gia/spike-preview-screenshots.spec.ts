import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const DIR = 'docs/screenshots/spike-preview';

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
    const literacy = page.getByRole('heading', { name: 'Free Financial Literacy' });
    const box = await literacy.boundingBox();
    expect(box).toBeTruthy();
    if (width === 1440) expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
    else expect(box?.y ?? 0).toBeLessThan(height);
    await page.screenshot({ path: `${DIR}/landing-${width}.png` });

    await page.getByRole('button', { name: 'Ask GIA', exact: true }).last().click();
    const dock = page.getByRole('dialog', { name: 'GIA guide' });
    await expect(dock).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Close GIA' })).toBeVisible();
    await expect(dock.locator('h1')).toHaveText('GIA — Your 1CMA AI Guide');
    await dock.screenshot({ path: `${DIR}/gia-panel-${width}.png` });

    await expect(dock.getByRole('heading', { name: 'Save a contact for booking or leader follow-up' })).toBeVisible();
    await dock.getByRole('heading', { name: 'Save a contact for booking or leader follow-up' }).scrollIntoViewIfNeeded();
    await dock.screenshot({ path: `${DIR}/consent-card-${width}.png` });
    await page.getByRole('button', { name: 'Close GIA' }).click();

    await page.setViewportSize({ width, height: width === 390 ? 1200 : 1400 });
    await page.goto('/gia');
    await expect(page.getByRole('heading', { name: 'GIA — Your 1CMA AI Guide' })).toBeVisible();
    await expect(page.getByText('Learning does not authorize you to sell insurance or give insurance advice.')).toBeVisible();
    await page.getByRole('heading', { name: 'Save a contact for booking or leader follow-up' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DIR}/gia-page-${width}.png`, fullPage: true });
  }
});
