import { test, expect } from '@playwright/test';
import { expectSafeVisitorLinks } from './visitor-link-assertions';

const exactEnglish = "SPIKE is a guided pathway from 1CMA Cebu that helps you grow into a financial entrepreneur, step by step, through workshops, mentorship and real-world practice. I'm GIA, and I'll walk you through it.";
test.use({ reducedMotion: 'reduce' });
for (const example of [
  { language: 'en', command: null },
  { language: 'ceb', command: 'Bisaya' },
  { language: 'tl', command: 'Tagalog' },
]) {
  test(`U1 different chip answers, approved English fallback and no GIYA in ${example.language}`, async ({ page }) => {
    test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
    await page.goto('/gia');
    await expect(page.getByText(/GIYA/i)).toHaveCount(0);
    if (example.command) {
      await page.getByRole('textbox', { name: 'Message GIA' }).fill(example.command);
      const switched = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      expect((await (await switched).json()).language).toBe(example.language);
      await page.reload();
    }
    const whatResult = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'What is this?', exact: true }).click();
    const what = await (await whatResult).json();
    expect(what).toMatchObject({ text: exactEnglish, language: example.language, citation: { id: 'KP-REC-09' } });
    await expect(page.getByText(exactEnglish, { exact: true })).toBeVisible();
    await expect(page.getByText(/GIYA/i)).toHaveCount(0);
    await expectSafeVisitorLinks(page);
    if (example.language === 'en') for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.screenshot({ path: `docs/screenshots/gia-first-screen/what-is-this-${width}.png`, fullPage: true });
    }
    await page.reload();
    const freeResult = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Is it free?', exact: true }).click();
    const free = await (await freeResult).json();
    expect(free).toMatchObject({ language: example.language, citation: { id: 'KP-LIT-01' } });
    expect(free.text).not.toBe(what.text);
    await expect(page.getByText(free.text, { exact: true })).toBeVisible();
  });
}
