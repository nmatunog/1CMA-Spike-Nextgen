import { test, expect } from '@playwright/test';
for (const width of [390, 768, 1440]) {
  test(`Versa six-field arrival reaches GIA at ${width}px`, async ({ page }) => {
    test.skip(process.env.MEMBER_LOCAL_DEMO !== 'true');
    await page.setViewportSize({ width, height: 900 });
    const query = new URLSearchParams({ mfn: 'Test Member', mln: 'Example', me: 'test.member@example.test', sfn: 'Test', sln: 'Sponsor', code: 'FREE-SYN00001' });
    await page.goto('/?' + query);
    await expect(page).toHaveURL(/\/spike-preview$/);
    await expect(page.getByRole('heading', { name: 'Welcome, Test Member.' })).toBeVisible();
    for (const value of ['Test Member Example', 'test.member@example.test', 'Test Sponsor', 'FREE-SYN00001']) await expect(page.getByText(value, { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /email|sponsor|code/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('FREE-SYN00001', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Continue with GIA' }).click();
    await expect(page.getByRole('dialog', { name: 'GIA guide' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'What is SPIKE? Hear it from GIA' }).click();
    await expect(page.getByRole('dialog').getByText(/SPIKE is a guided pathway/)).toBeVisible();
    await expect(page.getByText(/KP-REC-09/)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/signup');
    await expect(page.getByText('test.member@example.test', { exact: true })).toBeVisible();
  });
}
