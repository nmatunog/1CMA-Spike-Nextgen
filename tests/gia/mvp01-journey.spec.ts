import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const NAME = 'Synthetic MVP01 Journey';

test('MVP 01 capture → register → evaluate → engage persists in Command Center', async ({ browser }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await mkdir('docs/mvp01/screenshots', { recursive: true });
  await mkdir('work', { recursive: true });
  const access = JSON.parse(await readFile('work/demo-access.json', 'utf8'));
  const staffContext = await browser.newContext();
  const page = await staffContext.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(access.email);
  await page.getByLabel('Password').fill(access.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/recruitment/command');

  await page.goto('/recruitment/capture');
  await expect(page.getByRole('heading', { name: 'Capture prospect' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(NAME);
  await page.getByLabel('Email', { exact: true }).fill('mvp01-journey@example.test');
  await page.getByLabel('Campaign').fill('mvp01-synthetic');
  await page.getByLabel('Allow email').check();
  await page.getByLabel('Allow gia').check();
  await page.screenshot({ path: 'docs/mvp01/screenshots/capture.png', fullPage: true });
  await page.screenshot({ path: 'work/mvp01-capture.png', fullPage: true });
  await page.getByRole('button', { name: 'Save prospect' }).click();
  await expect(page.getByRole('status')).toContainText(/Prospect captured/);
  await expect(page.getByRole('status')).toContainText(/consent unknown/);
  await expect(page.getByRole('status')).toContainText(/cannot be messaged/);

  await page.goto('/recruitment/command');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('dt', { hasText: 'Captured' })).toBeVisible();
  await expect(page.getByRole('heading', { name: NAME }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: NAME, exact: true }).first().click();
  await expect(page.getByText('Cannot be messaged — consent unknown.')).toBeVisible();
  await expect(page.getByText(/Campaign mvp01-synthetic/)).toBeVisible();
  const follow = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save follow-up' }) });
  await follow.getByLabel('Assigned leader email').fill(access.leaderEmail);
  await follow.getByLabel('Next action', { exact: true }).fill('Leader intro after capture');
  await follow.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(page.getByRole('status')).toHaveText('Follow-up saved');
  await page.screenshot({ path: 'docs/mvp01/screenshots/register.png', fullPage: true });
  await page.screenshot({ path: 'work/mvp01-register.png', fullPage: true });

  const evalForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record evaluation' }) });
  await evalForm.getByLabel('Background', { exact: true }).fill('Synthetic MVP 01 background');
  await evalForm.getByLabel('Education').fill('Synthetic college');
  await evalForm.getByLabel('Career interests / motivation').fill('Literacy then FEP');
  await evalForm.getByLabel('Program interest').selectOption('fep');
  await evalForm.getByLabel('Availability / readiness').fill('Evenings Asia/Manila');
  await evalForm.getByLabel('Outcome').selectOption('proceed');
  await evalForm.getByLabel('Recommended next action').selectOption('fep');
  await evalForm.getByRole('button', { name: 'Record evaluation' }).click();
  await expect(page.getByRole('status')).toHaveText('Evaluation saved');
  await expect(page.getByText(/Stage new_lead/)).toBeVisible();
  await expect(page.getByText(/official decision/)).toBeVisible();
  await page.screenshot({ path: 'docs/mvp01/screenshots/evaluate.png', fullPage: true });
  await page.screenshot({ path: 'work/mvp01-evaluate.png', fullPage: true });

  await page.getByLabel('Kind').selectOption('gia.conversation');
  await page.getByLabel('Intent — no personal details').fill('literacy');
  await page.getByLabel('Citation').fill('KP-LIT-01');
  await page.getByRole('button', { name: 'Record GIA event' }).click();
  await expect(page.getByRole('status')).toHaveText('GIA engagement event recorded');
  await expect(page.getByRole('listitem').filter({ hasText: 'gia.conversation' })).toContainText('not a decision');

  await follow.getByLabel('Follow-up outcome').selectOption('reached');
  await follow.getByLabel('Next action', { exact: true }).fill('Book synthetic FEP after GIA');
  await follow.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(page.getByRole('status')).toHaveText('Follow-up saved');
  await expect(page.getByText(/last engaged/i).first()).toBeVisible();
  await page.screenshot({ path: 'docs/mvp01/screenshots/engage.png', fullPage: true });
  await page.screenshot({ path: 'work/mvp01-engage.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/mvp01/screenshots/engage-mobile.png', fullPage: true });

  const leaderContext = await browser.newContext();
  const leaderPage = await leaderContext.newPage();
  await leaderPage.goto('/login');
  await leaderPage.getByLabel('Email').fill(access.leaderEmail);
  await leaderPage.getByLabel('Password').fill(access.leaderPassword);
  await leaderPage.getByRole('button', { name: 'Sign in' }).click();
  await leaderPage.waitForURL('/recruitment/command');
  await expect(leaderPage.getByRole('heading', { name: NAME }).first()).toBeVisible();
  await expect(leaderPage.getByRole('link', { name: 'Capture prospect' })).toHaveCount(0);

  await staffContext.close();
  await leaderContext.close();
});

test('GIA visitor conversation and handoff appear on the candidate timeline', async ({ browser, page }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  const access = JSON.parse(await readFile('work/demo-access.json', 'utf8'));
  const visitor = 'Synthetic GIA Timeline Visitor';

  await page.goto('/gia');
  await page.getByLabel('Name', { exact: true }).fill(visitor);
  await page.getByLabel('Email', { exact: true }).fill('gia-timeline@example.test');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Save consent and contact' }).click();
  await expect(page.getByText(/consent and contact have been saved/)).toBeVisible();
  await page.getByRole('button', { name: 'I want to learn money basics' }).click();
  await expect(page.getByRole('link', { name: 'KP-LIT-01 · v0.2' })).toBeVisible();
  await page.getByRole('button', { name: 'Talk to a 1CMA Leader' }).click();
  await expect(page.getByText(/1CMA leader/i).last()).toBeVisible();
  await page.getByRole('button', { name: 'Save leader request' }).click();
  await expect(page.getByText(/Your leader request is saved/)).toBeVisible();
  await page.screenshot({ path: 'docs/gia/screenshots/gia-timeline-handoff.png', fullPage: true });
  await page.screenshot({ path: 'work/gia-timeline-handoff.png', fullPage: true });

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await staffPage.goto('/login');
  await staffPage.getByLabel('Email').fill(access.email);
  await staffPage.getByLabel('Password').fill(access.password);
  await staffPage.getByRole('button', { name: 'Sign in' }).click();
  await staffPage.waitForURL('/recruitment/command');
  await expect(staffPage.getByRole('heading', { name: visitor }).first()).toBeVisible({ timeout: 15000 });
  await staffPage.getByRole('button', { name: visitor, exact: true }).first().click();
  await expect(staffPage.getByRole('listitem').filter({ hasText: 'gia.conversation' }).first()).toContainText('not a decision');
  await expect(staffPage.getByRole('listitem').filter({ hasText: 'gia.handoff' }).first()).toBeVisible();
  await expect(staffPage.getByRole('listitem').filter({ hasText: 'literacy.interest' }).first()).toBeVisible();

  const follow = staffPage.locator('form').filter({ has: staffPage.getByRole('button', { name: 'Save follow-up' }) });
  await follow.getByLabel('Assigned leader email').fill(access.leaderEmail);
  await follow.getByLabel('Next action', { exact: true }).fill('Leader intro after GIA handoff');
  await follow.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(staffPage.getByRole('status')).toHaveText('Follow-up saved');

  const evalForm = staffPage.locator('form').filter({ has: staffPage.getByRole('button', { name: 'Record evaluation' }) });
  await evalForm.getByLabel('Background', { exact: true }).fill('Synthetic GIA timeline background');
  await evalForm.getByLabel('Education').fill('Synthetic college');
  await evalForm.getByLabel('Career interests / motivation').fill('Literacy then FEP');
  await evalForm.getByLabel('Program interest').selectOption('literacy');
  await evalForm.getByLabel('Availability / readiness').fill('Evenings Asia/Manila');
  await evalForm.getByLabel('Outcome').selectOption('proceed');
  await evalForm.getByLabel('Recommended next action').selectOption('literacy');
  await evalForm.getByRole('button', { name: 'Record evaluation' }).click();
  await expect(staffPage.getByRole('status')).toHaveText('Evaluation saved');
  await staffPage.screenshot({ path: 'docs/mvp01/screenshots/gia-timeline.png', fullPage: true });
  await staffPage.screenshot({ path: 'work/mvp01-gia-timeline.png', fullPage: true });

  await page.getByRole('button', { name: 'STOP / opt out' }).click();
  await expect(page.getByText(/opted out/i)).toBeVisible();
  await page.screenshot({ path: 'docs/gia/screenshots/gia-stop.png', fullPage: true });

  const internContext = await browser.newContext();
  const internPage = await internContext.newPage();
  await internPage.goto('/gia');
  await internPage.getByRole('radio', { name: 'Intern' }).click();
  await expect(internPage.getByRole('button', { name: 'Show FEP sessions' })).toHaveCount(0);
  await internPage.getByRole('textbox', { name: 'Message GIA' }).fill('Show FEP sessions');
  await internPage.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(internPage.getByText(/FEP session booking is part of the recruitment guide/)).toBeVisible();
  await internPage.screenshot({ path: 'docs/gia/screenshots/gia-intern-fep-denied.png', fullPage: true });

  await staffContext.close();
  await internContext.close();
});
