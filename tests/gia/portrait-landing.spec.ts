import { test, expect } from '@playwright/test';
import ownerWording from '../../docs/gia/owner-wording-2026-11-16.json';

const INTRO = ownerWording.entries.find(entry => entry.id === 'KP-REC-09')!.answers.en;
test.use({ reducedMotion: 'reduce' });

test('root opens the landing page and /gia keeps full chat', async ({ page, request }) => {
  const response = await request.get('/', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, 'http://localhost').pathname).toBe('/spike-preview');
  await page.goto('/');
  await expect(page).toHaveURL(/\/spike-preview$/);
  await expect(page.getByRole('heading', { name: 'Ask GIA. Start free.' })).toBeVisible();
  await page.goto('/gia');
  await expect(page.getByLabel('Conversation', { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`approved landing: ${theme} ${width}px`, async ({ page }) => {
      const height = width === 390 ? 844 : 900;
      await page.setViewportSize({ width, height });
      await page.goto('/spike-preview');
      await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      await page.mouse.move(0, 0);
      const hero = page.getByTestId('gia-hero');
      const portrait = hero.getByAltText('GIA, your 1CMA AI guide', { exact: true });
      await expect.poll(() => portrait.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 465)).toBe(true);
      const input = (await hero.getByRole('textbox', { name: 'Message GIA' }).boundingBox())!;
      expect(input.y).toBeGreaterThanOrEqual(0);
      expect(input.y + input.height).toBeLessThanOrEqual(height);
      const imageBox = (await portrait.boundingBox())!;
      const heading = (await hero.getByRole('heading').boundingBox())!;
      if (width === 390) expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(heading.y);
      else expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(input.x);
      const options = page.getByRole('region', { name: 'Explore with GIA' });
      await expect(options.getByRole('button')).toHaveCount(3);
      for (const name of ['What is SPIKE? Hear it from GIA', 'Free Financial Literacy Start learning, free', 'Talk to GIA Ask anything, anytime']) {
        const box = (await options.getByRole('button', { name }).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(88);
        if (width === 1440) expect(box.y + box.height).toBeLessThanOrEqual(height);
      }
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expect(page.locator('header').getByRole('button')).toHaveCount(1);
      await expect(page.locator('header').getByRole('img')).toHaveCount(2);
      await expect(page.getByText(/Find your path|Meet GIA|Coming soon|Photo coming soon|Synthetic details only|NEXT RIDE/)).toHaveCount(0);
      await expect(page.locator('footer')).toHaveText('Privacy notice · Reply STOP to opt out');
      await expect(page.getByRole('link', { name: 'Privacy notice' })).toHaveAttribute('href', '/gia/privacy');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `docs/screenshots/gia-landing/${theme}-${width}.png` });
      if (width === 390) await page.screenshot({ path: `docs/screenshots/gia-landing/${theme}-${width}-full.png`, fullPage: true });
    });
  }
}

test('What is SPIKE and literacy cards reach distinct approved answers without consent capture', async ({ page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await page.goto('/spike-preview');
  await page.getByRole('button', { name: 'What is SPIKE? Hear it from GIA' }).click();
  const dialog = page.getByRole('dialog', { name: 'GIA guide' });
  await expect(dialog.getByText(INTRO, { exact: true })).toBeVisible();
  await expect(dialog.getByText('KP-REC-09 · v0.1', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/GIYA/)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'What is SPIKE? Hear it from GIA' })).toBeFocused();
  await page.getByRole('button', { name: 'Free Financial Literacy Start learning, free' }).click();
  await expect(dialog.getByText('KP-LIT-01 · v0.2', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(INTRO, { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveCount(0);
});

test('hero sends a synthetic question to the same GIA chat', async ({ page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await page.goto('/spike-preview');
  await page.getByRole('textbox', { name: 'Message GIA' }).fill('What is SPIKE?');
  await page.getByRole('button', { name: 'Send to GIA' }).click();
  await expect(page.getByRole('dialog').getByText(INTRO, { exact: true })).toBeVisible();
});

test('chat portraits load in landing panel and full chat', async ({ page }) => {
  for (const path of ['/gia', '/spike-preview']) {
    await page.goto(path);
    if (path === '/spike-preview') await page.getByRole('button', { name: 'Talk to GIA Ask anything, anytime' }).click();
    const scope = path === '/gia' ? page.locator('body') : page.getByRole('dialog');
    const avatars = scope.getByTestId('gia-avatar');
    await expect(avatars.first()).toBeVisible();
    for (const avatar of await avatars.all()) {
      await expect.poll(() => avatar.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 256)).toBe(true);
      await expect(avatar).toHaveAttribute('data-fallback', 'false');
    }
  }
});

test('a failed avatar uses the G fallback', async ({ page }) => {
  await page.route('**/spike-preview/gia-avatar.webp', route => route.abort());
  await page.goto('/gia');
  const avatars = page.getByTestId('gia-avatar');
  await expect(avatars.first()).toBeVisible();
  for (const avatar of await avatars.all()) {
    await expect(avatar).toHaveAttribute('data-fallback', 'true');
    await expect(avatar.locator('img')).toHaveCount(0);
    await expect(avatar).toHaveText('G');
  }
});
