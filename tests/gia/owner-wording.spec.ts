import { test, expect } from '@playwright/test';
import selected from '../../docs/gia/owner-wording-2026-11-16.json';

const application = selected.entries.find(e => e.id === 'KP-REC-08')!;
for (const example of [
  { lang: 'en', command: null, confirmation: null, question: 'Does SPIKE submit or confirm my AIA application?' },
  { lang: 'ceb', command: 'Bisaya', confirmation: 'Sige, mag-Bisaya ta. Unsa akong ikatabang?', question: 'Ang SPIKE ba ang mo-submit o mo-confirm sa akong AIA application?' },
  { lang: 'tl', command: 'Tagalog', confirmation: 'Sige, mag-Tagalog tayo. Paano kita matutulungan?', question: 'Ang SPIKE ba ang magsu-submit o magko-confirm ng AIA application ko?' },
] as const) {
  test(`owner-reviewed application FAQ is served exactly in ${example.lang}`, async ({ page }) => {
    test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
    await page.goto('/gia');
    const composer = page.getByRole('textbox', { name: 'Message GIA' });
    const send = page.getByRole('button', { name: 'Send', exact: true });
    if (example.command) {
      await composer.fill(example.command);
      await send.click();
      await expect(page.getByText(example.confirmation, { exact: true })).toBeVisible();
    }
    await composer.fill(example.question);
    const result = page.waitForResponse(response => response.url().endsWith('/api/gia')
      && response.request().method() === 'POST'
      && response.request().postDataJSON()?.text === example.question);
    await send.click();
    const response = await result;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      intent: 'answer', language: example.lang, text: application.answers[example.lang],
      citation: { id: 'KP-REC-08', version: '0.1' },
    });
    await expect(page.getByText('KP-REC-08 · v0.1', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'KP-REC-08 · v0.1' })).toHaveCount(0);
  });
}
