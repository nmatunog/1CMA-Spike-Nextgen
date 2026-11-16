import { test, expect } from '@playwright/test';
import { GIA_CONSENT_CHECKBOX, GIA_CONSENT_FINE, GIA_DISCLAIMER } from '../../lib/gia/ui-copy';
import { expectSafeVisitorLinks } from './visitor-link-assertions';

test.use({ reducedMotion: 'reduce' });
for (const width of [390, 1440]) {
  test(`inviting first screen and compact compliance at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/gia');
    await expect(page.getByRole('heading', { name: 'GIA', exact: true })).toBeVisible();
    await expect(page.getByText('Your AI guide. Ask away.')).toBeVisible();
    await expect(page.getByLabel('Conversation', { exact: true }).getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/GIYA Institute|role-aware guide|local adapter|entitlements/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Privacy notice' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'STOP / opt out' })).toBeVisible();
    await expect(page.locator('footer')).toContainText("Don't send IDs or documents.");
    await expect(page.locator('footer')).toContainText(GIA_DISCLAIMER);
    const composer = await page.getByRole('textbox', { name: 'Message GIA' }).boundingBox();
    const footer = await page.locator('footer').boundingBox();
    expect(composer).not.toBeNull(); expect(footer).not.toBeNull();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual((width === 390 ? 844 : 1000) + 1);
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(footer!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expectSafeVisitorLinks(page);
    await page.screenshot({ path: `docs/screenshots/gia-first-screen/after-${width}.png`, fullPage: true });
  });
}

test('existing approved value is available before a signup or contact request', async ({ page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  const actions: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/gia') && request.method() === 'POST') actions.push(request.postDataJSON().action); });
  await page.goto('/gia');
  await page.getByRole('button', { name: 'What is this?', exact: true }).click();
  await expect(page.getByText('KP-REC-09 · v0.1', { exact: true })).toBeVisible();
  await expect(page.getByText(/SPIKE is a guided pathway from 1CMA Cebu/)).toBeVisible();
  await expect(page.getByText(/GIYA/)).toHaveCount(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More options', exact: true })).toBeVisible();
  expect(actions).toEqual(['message']);
  await page.getByText('Find my path', { exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'A student internship', exact: true }).click();
  expect((await response).request().postDataJSON().program).toBe('intern');
  await expect(page.getByRole('button', { name: 'I want to explore a business path' })).toHaveCount(0);
});

for (const program of ['intern', 'ra']) {
  test(`testing query override preserves the ${program} adapter boundaries`, async ({ page }) => {
    test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
    await page.goto(`/gia?program=${program}`);
    await page.getByRole('textbox', { name: 'Message GIA' }).fill('Show FEP sessions');
    const result = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const response = await result;
    expect(response.request().postDataJSON().program).toBe(program);
    expect(await response.json()).toMatchObject({ intent: 'request_leader' });
    await expect(page.getByRole('button', { name: 'Show FEP sessions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Book this FEP' })).toHaveCount(0);
  });
}

test('explicit self-identification selects an existing path without exposing a role switch', async ({ page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await page.goto('/gia');
  await page.getByRole('textbox', { name: 'Message GIA' }).fill("I'm a student");
  const result = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect((await result).request().postDataJSON().program).toBe('intern');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'I want to explore a business path' })).toHaveCount(0);
});

test('contact capture is optional, unchanged, and unticked until explicitly consented', async ({ page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await page.goto('/gia');
  await page.getByRole('button', { name: 'How do I start?', exact: true }).click();
  await page.getByRole('button', { name: 'Save a contact', exact: true }).click();
  await expect(page.getByText(GIA_CONSENT_FINE, { exact: true })).toBeVisible();
  const checkbox = page.getByRole('checkbox', { name: GIA_CONSENT_CHECKBOX });
  await expect(checkbox).not.toBeChecked();
  await page.getByLabel('Name', { exact: true }).fill('Synthetic First Screen Visitor');
  await page.getByLabel('Email', { exact: true }).fill('first-screen@example.test');
  const save = page.getByRole('button', { name: 'Save consent and contact', exact: true });
  await expect(save).toBeDisabled();
  await checkbox.check();
  await save.click();
  await expect(page.getByText('Your consent and contact have been saved for recruitment follow-up.')).toBeVisible();
});

test('STOP remains available before contact capture and disables further submission', async ({ page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await page.goto('/gia');
  await page.getByRole('button', { name: 'STOP / opt out' }).click();
  await expect(page.getByText(/opted out/i)).toBeVisible();
  await page.getByRole('textbox', { name: 'Message GIA' }).fill('hello');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
});

test('crisis safety still takes priority on first open without consent', async ({ page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await page.goto('/gia');
  await page.getByRole('textbox', { name: 'Message GIA' }).fill('I want to die');
  const result = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  expect(await (await result).json()).toMatchObject({ reason: 'urgent', citation: { id: 'KP-SAFETY-01' } });
  await expect(page.getByText(/KP-SAFETY-01/)).toBeVisible();
});
