import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const NAME = 'Synthetic AIA Advisor';

test('Command Center AIA registration keeps recruiter attribution and blocks false completion', async ({ browser }) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  const access = JSON.parse(await readFile('work/demo-access.json', 'utf8'));
  const staffContext = await browser.newContext();
  const page = await staffContext.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(access.email);
  await page.getByLabel('Password').fill(access.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');

  await page.goto('/recruitment/capture');
  await page.getByLabel('Name', { exact: true }).fill(NAME);
  await page.getByLabel('Email', { exact: true }).fill('aia-e2e@example.test');
  await page.getByLabel('Campaign').fill('aia-synthetic');
  await page.getByRole('button', { name: 'Save prospect' }).click();
  await expect(page.getByRole('status')).toContainText(/Prospect captured/);

  await page.goto('/recruitment/command');
  await page.getByRole('button', { name: NAME, exact: true }).first().click();
  const follow = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save follow-up' }) });
  await follow.getByLabel('Assigned leader email').fill(access.leaderEmail);
  await follow.getByLabel('Stage').selectOption('fep_attended');
  await follow.getByRole('button', { name: 'Save follow-up' }).click();
  await expect(page.getByRole('status')).toHaveText('Follow-up saved');

  const evalForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record evaluation' }) });
  await evalForm.getByLabel('Background', { exact: true }).fill('Synthetic AIA E2E background');
  await evalForm.getByLabel('Education').fill('Synthetic college');
  await evalForm.getByLabel('Career interests / motivation').fill('Advisor after FEP');
  await evalForm.getByLabel('Program interest').selectOption('ra_spike');
  await evalForm.getByLabel('Availability / readiness').fill('Evenings Asia/Manila');
  await evalForm.getByLabel('Outcome').selectOption('proceed');
  await evalForm.getByLabel('Recommended next action').selectOption('leader_conversation');
  await evalForm.getByRole('button', { name: 'Record evaluation' }).click();
  await expect(page.getByRole('status')).toHaveText('Evaluation saved');

  const aia = page.locator('form').filter({ has: page.getByRole('button', { name: 'Confirm recruiter attribution' }) });
  await expect(aia.getByText(/attribution not confirmed/)).toBeVisible();
  await expect(page.getByRole('link', { name: /aia\.com\.ph/ })).toHaveCount(0);
  await expect(aia.getByRole('button', { name: 'Record candidate self-report (pending)' })).toBeDisabled();
  await expect(aia.getByRole('button', { name: 'Mark submitted (staff)' })).toBeDisabled();
  await expect(aia.getByRole('button', { name: 'Mark verified (staff)' })).toBeDisabled();
  await aia.getByLabel('Referral source').fill('FEP session introducer');
  await aia.getByRole('button', { name: 'Confirm recruiter attribution' }).click();
  await expect(page.getByRole('status')).toHaveText('Recruiter attribution confirmed');
  await expect(page.getByText(/Help candidate register via your AIA account \/ iRecruit/).first()).toBeVisible();
  await aia.getByRole('button', { name: 'Record candidate self-report (pending)' }).click();
  await expect(page.getByRole('status')).toHaveText('AIA registration pending');
  await expect(page.getByText(/Status aia_registration_pending/)).toBeVisible();
  await expect(page.getByText(/Stage fep_attended/)).toBeVisible();
  await aia.getByRole('button', { name: 'Mark submitted (staff)' }).click();
  await expect(page.getByRole('status')).toHaveText('AIA registration submitted');
  await aia.getByRole('button', { name: 'Mark verified (staff)' }).click();
  await expect(page.getByRole('status')).toHaveText('AIA registration verified');
  await expect(page.getByText(/SPIKE paid no/)).toBeVisible();
  await expect(page.getByText(/recruiter /).first()).toContainText(access.leaderEmail);

  await page.goto('/recruitment/capture');
  await page.getByLabel('Name', { exact: true }).fill('Synthetic AIA Intern');
  await page.getByLabel('Email', { exact: true }).fill('aia-intern-e2e@example.test');
  await page.getByRole('button', { name: 'Save prospect' }).click();
  await page.goto('/recruitment/command');
  await page.getByRole('button', { name: 'Synthetic AIA Intern', exact: true }).first().click();
  const internEval = page.locator('form').filter({ has: page.getByRole('button', { name: 'Record evaluation' }) });
  await internEval.getByLabel('Background', { exact: true }).fill('Synthetic intern');
  await internEval.getByLabel('Education').fill('Synthetic college');
  await internEval.getByLabel('Career interests / motivation').fill('Internship');
  await internEval.getByLabel('Program interest').selectOption('intern');
  await internEval.getByLabel('Availability / readiness').fill('Evenings');
  await internEval.getByLabel('Outcome').selectOption('proceed');
  await internEval.getByLabel('Recommended next action').selectOption('follow_up');
  await internEval.getByRole('button', { name: 'Record evaluation' }).click();
  await expect(page.getByRole('status')).toHaveText('Evaluation saved');
  await expect(page.getByText(/Official AIA registration does not apply/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm recruiter attribution' })).toHaveCount(0);

  await staffContext.close();
});
