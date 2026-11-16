import { test, expect } from '@playwright/test';

for (const example of [
  { lang: 'en', command: null, question: 'Should I share my AIA password with my recruiter?', safety: 'Do not send your AIA login credentials.' },
  { lang: 'ceb', command: 'Bisaya', question: 'Pwede nako ihatag ang akong AIA password sa recruiter?', safety: 'Ayaw og send og AIA login.' },
  { lang: 'tl', command: 'Tagalog', question: 'Dapat ko bang ibigay ang AIA password ko sa recruiter?', safety: 'Huwag mong ipadala ang AIA login details mo.' },
]) {
  test(`LOW-N3 approved safety and handoff in ${example.lang}`, async ({ page }) => {
    test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
    await page.goto('/gia');
    const composer = page.getByRole('textbox', { name: 'Message GIA' });
    const send = page.getByRole('button', { name: 'Send', exact: true });
    if (example.command) {
      const switched = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST');
      await composer.fill(example.command);
      await send.click();
      await switched;
      await expect(page.getByText(example.lang === 'ceb' ? 'Sige, mag-Bisaya ta. Unsa akong ikatabang?' : 'Sige, mag-Tagalog tayo. Paano kita matutulungan?', { exact: true })).toBeVisible();
    }
    const result = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST' && r.request().postDataJSON()?.text === example.question);
    await composer.fill(example.question);
    await send.click();
    const response = await result;
    expect(response.status()).toBe(200);
    const reply = await response.json();
    expect(reply).toMatchObject({ intent: 'request_leader', reason: 'aia_password_sharing', language: example.lang });
    expect(reply.text).toContain(example.safety);
    await expect(page.getByText(reply.text, { exact: true })).toBeVisible();
  });
}
for (const question of [
  'Who submits my insurance application to AIA?',
  "I can't log in to iRecruit",
  'I cannot log in to AIA',
  'I am unable to log in to iRecruit',
]) {
  test(`LOW-W1/N6 visitor routing: ${question}`, async ({ page }) => {
    test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
    await page.goto('/gia');
    const result = page.waitForResponse(r => r.url().endsWith('/api/gia') && r.request().method() === 'POST' && r.request().postDataJSON()?.text === question);
    await page.getByRole('textbox', { name: 'Message GIA' }).fill(question);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const response = await result;
    expect(response.status()).toBe(200);
    const reply = await response.json();
    expect(reply.citation?.id).not.toBe('KP-REC-08');
    if (!question.includes('insurance')) expect(reply).toMatchObject({ intent: 'request_leader', reason: 'off_script' });
  });
}
