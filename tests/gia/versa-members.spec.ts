import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.GIA_TEST_URL || 'http://127.0.0.1:3002';
const PASSWORD = 'Synthetic-member-password-8!';
const directDb = postgres(process.env.GIA_TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:55432/postgres', { max: 1, prepare: false });
// PGlite shares one backend across sockets. Keep each test query's wire messages
// together so an app request cannot replace its unnamed portal between Bind/Execute.
async function db(parts: TemplateStringsArray, ...values: unknown[]) {
  return directDb.begin(async transaction => [...await (transaction as unknown as typeof directDb)(parts, ...values as never[])]);
}
test.use({ reducedMotion: 'reduce' });
test.beforeEach(() => test.skip(process.env.MEMBER_LOCAL_DEMO !== 'true', 'Requires the explicitly enabled local synthetic member demo.'));
test.afterAll(async () => { await directDb.end(); });
async function url(page: Page, email: string, code: string, extra: Record<string,string> = {}) {
  const body = JSON.stringify({ mfn: 'Demo', mln: 'Member', me: email, sfn: 'Test', sln: 'Sponsor', code, campaign: 'opaque-extra-synthetic-only', role: 'admin', ...extra });
  const { secret } = JSON.parse(readFileSync('work/member-issuer.json','utf8'));
  const timestamp = String(Math.floor(Date.now()/1000)), nonce = randomBytes(32).toString('hex');
  const signature = createHmac('sha256',secret).update(`versa-issuer-v1\n${timestamp}\n${nonce}\n${body}`).digest('hex');
  const response = await page.request.post('/api/member/handoff',{headers:{'content-type':'application/json','x-versa-timestamp':timestamp,'x-versa-nonce':nonce,'x-versa-signature':signature}, data:body});
  expect(response.status()).toBe(200);
  const link = (await response.json()).url;
  expect(link).not.toContain(email); expect(link).not.toContain(code);
  return link;
}
async function post(page: Page, body: object) { return page.request.post('/api/member', { headers: { origin: ORIGIN }, data: body }); }
async function mailbox(email: string, kind = 'verify') {
  await expect.poll(async () => (await db`SELECT link FROM member_local_mail WHERE destination=${email} AND kind=${kind} ORDER BY created_at DESC LIMIT 1`).length).toBe(1);
  const [row] = await db`SELECT link FROM member_local_mail WHERE destination=${email} AND kind=${kind} ORDER BY created_at DESC LIMIT 1`;
  return String(row.link);
}
async function sponsorHidden(page: Page) {
  expect(await page.locator('body').innerText()).not.toMatch(/Test Sponsor|Another Sponsor/);
  expect(await page.content()).not.toMatch(/Test Sponsor|Another Sponsor|sponsor_first|sponsor_last/);
  for (const path of ['/api/auth/session','/api/member']) expect(await (await page.request.get(path)).text()).not.toMatch(/Test Sponsor|Another Sponsor|sponsor_first|sponsor_last/);
}
async function verify(page: Page, email: string) {
  await page.goto(await mailbox(email));
  await expect(page).toHaveURL(/\/member\/verify$/);
  await sponsorHidden(page);
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
}
async function signin(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function signup(page: Page, email: string, code: string, password = PASSWORD) {
  await page.goto(await url(page, email, code)); await expect(page).toHaveURL(/\/signup$/);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create my account', exact: true }).click();
  await expect(page).toHaveURL(/\/signup-done$/);
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await sponsorHidden(page);
  await expect(page.getByText(/No email was sent/)).toBeVisible();
}
async function active(page: Page, email: string, code: string) {
  await signup(page, email, code); await verify(page, email); await signin(page, email);
  await expect(page).toHaveURL(/\/member\/account$/);
  await expect(page.getByRole('heading', { name: 'Your SPIKE account' })).toBeVisible();
  await sponsorHidden(page);
}

test('approved signup, check-email and signin screens at mobile and desktop, light and dark', async ({ page }) => {
  for (const width of [390,1440]) {
    const email = `signup${width}@example.test`;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto(await url(page, email, width === 390 ? 'FREE-SYN00020' : 'FREE-SYN00021'));
    await expect(page).toHaveURL(/\/signup$/);
    const details = page.getByRole('definition');
    await expect(details).toHaveText(['Demo Member', email, 'Test Sponsor', width === 390 ? 'FREE-SYN00020' : 'FREE-SYN00021']);
    await expect(page.locator('input[type=password]')).toHaveCount(2); // Password + confirm; identity is read-only text.
    expect(await page.locator('body').innerText()).not.toContain('GIYA');
    expect(await page.content()).not.toContain('opaque-extra-synthetic-only');
    for (const theme of ['light','dark']) {
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();
      await page.mouse.move(0,0); await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `docs/screenshots/versa-members/signup-${theme}-${width}.png`, fullPage: true });
    }
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page).toHaveURL(/\/signup-done$/);
    await expect(page.getByText(/No email was sent/)).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/versa-members/check-email-${width}.png`, fullPage: true });
    await verify(page, email);
    for (const theme of ['dark','light']) {
      const button = page.getByRole('button', { name: `Switch to ${theme} mode` });
      if (await button.isVisible()) await button.click();
      await page.mouse.move(0,0);
      await page.screenshot({ path: `docs/screenshots/versa-members/signin-${theme}-${width}.png`, fullPage: true });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('root consumes query, rejects duplicate/incomplete fields, and keeps extra fields server-side', async ({ page }) => {
  const arrival = await url(page, 'readonly@example.test','FREE-SYN00022');
  const response = await page.request.get(arrival, { maxRedirects: 0 });
  expect(response.status()).toBe(303); expect(new URL(response.headers().location, ORIGIN).pathname).toBe('/signup');
  expect(response.headers()['cache-control']).toContain('no-store'); expect(response.headers()['referrer-policy']).toBe('no-referrer');
  const headers = JSON.stringify(response.headers()); expect(headers).not.toContain('readonly@example.test'); expect(headers).not.toContain('FREE-SYN00022'); expect(headers).not.toContain('opaque-extra');
  await page.goto('/signup');
  expect((await page.context().cookies()).find(cookie => cookie.name === 'spike_member_handoff')?.httpOnly).toBe(true);
  expect((await db`SELECT 1 FROM user_accounts a JOIN candidates c ON c.id=a.candidate_id WHERE c.email='readonly@example.test'`).length).toBe(0);
  const tampered = await post(page, { action: 'signup', password: PASSWORD, confirm: PASSWORD, me: 'tampered@example.test' });
  expect(tampered.status()).toBe(400);
  const crossSite = await page.request.post('/api/member', { headers: { origin: 'https://unrelated.example.test' }, data: { action: 'begin' } });
  expect(crossSite.status()).toBe(403);
  const duplicate = await page.request.get(await url(page, 'duplicate@example.test','FREE-SYN00023')+'&me=other%40example.test', { maxRedirects: 0 });
  expect(new URL(duplicate.headers().location, ORIGIN).pathname).toBe('/signup');
  await page.goto('/signup'); await expect(page.getByRole('heading', { name: 'Open your Versa handoff' })).toBeVisible();
  await page.goto('/?mfn=Only'); await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole('heading', { name: 'Open your Versa handoff' })).toBeVisible();
  await page.goto(await url(page, 'escape@example.test','FREE-SYN00024', { mfn: '<img src=x onerror=alert(1)>' }));
  await expect(page.getByRole('heading')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  const replay=await page.request.get(arrival,{maxRedirects:0});
  expect(replay.status()).toBe(303); expect(replay.headers()['set-cookie']).toContain('Max-Age=0');
  await page.goto('/signup'); await expect(page.getByRole('heading',{name:'Open your Versa handoff'})).toBeVisible();
});

test('new verified account, subsequent signin, forgot/reset, password change, logout and staff isolation', async ({ page, browser }) => {
  const email = 'lifecycle@example.test';
  await active(page,email,'PRO-SYN00025');
  expect(await page.locator('body').innerText()).not.toContain('Test Sponsor');
  expect(await page.content()).not.toContain('sponsor_first');
  expect(await (await page.request.get('/api/auth/session')).text()).not.toContain('Test Sponsor');
  await expect(page.getByText(/This handoff grants no course access/)).toBeVisible();
  const [account] = await db`SELECT account_id FROM member_credentials WHERE email=${email}`;
  expect((await db`SELECT 1 FROM program_enrollments WHERE account_id=${account.account_id}`).length).toBe(0);
  const [claim] = await db`SELECT variable_data,sponsor_first,sponsor_last FROM member_handoff_claims WHERE account_id=${account.account_id}`;
  expect([claim.sponsor_first,claim.sponsor_last]).toEqual(['Test','Sponsor']);
  expect(claim.variable_data).toEqual({ campaign: 'opaque-extra-synthetic-only', role: 'admin' });
  expect((await page.request.get('/api/recruitment/command')).status()).toBe(401);
  expect((await page.request.get('/api/admin/candidates')).status()).toBe(401);
  const oldCookies = await page.context().cookies();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/signin$/);
  const replay = await browser.newContext(); await replay.addCookies(oldCookies);
  const oldSession = await replay.request.get(`${ORIGIN}/api/auth/session`); expect((await oldSession.json())?.user).toBeUndefined(); await replay.close();
  await signin(page,email); await expect(page).toHaveURL(/\/member\/account$/);
  const beforeReset = await page.context().cookies();
  await page.goto('/signin'); await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByRole('button', { name: 'Request reset link' }).click();
  await expect(page.getByRole('status')).toContainText('This draft does not send email');
  const link = await mailbox(email,'reset'), token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
  await page.goto(link); await expect(page).toHaveURL(/\/member\/reset$/); await sponsorHidden(page);
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-new-password-8');
  await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-new-password-8');
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();
  expect((await post(page,{ action:'reset',token,password:PASSWORD,confirm:PASSWORD })).status()).toBe(400);
  const stale = await browser.newContext(); await stale.addCookies(beforeReset);
  expect((await (await stale.request.get(`${ORIGIN}/api/auth/session`)).json())?.user).toBeUndefined(); await stale.close();
  await page.goto('/signin'); await signin(page,email,'Synthetic-new-password-8'); await expect(page).toHaveURL(/\/member\/account$/);
  await page.getByLabel('Current password').fill('Synthetic-new-password-8');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic-third-password-8');
  await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-third-password-8');
  await page.getByRole('button', { name: 'Change password', exact: true }).click(); await expect(page).toHaveURL(/\/signin$/);
  await signin(page,email,'Synthetic-third-password-8'); await expect(page).toHaveURL(/\/member\/account$/);
});

test('existing and unknown accounts have identical arrival/signup responses without password overwrite', async ({ page }) => {
  const email = 'existing@example.test'; await active(page,email,'FREE-SYN00026');
  await page.getByRole('button',{name:'Sign out',exact:true}).click(); await expect(page).toHaveURL(/\/signin$/);
  await page.goto(await url(page, email,'FREE-SYN00027',{ sln: 'Another Sponsor' })); await expect(page).toHaveURL(/\/signup$/);
  expect((await post(page,{action:'signup',password:'Must-not-overwrite',confirm:'Must-not-overwrite'})).status()).toBe(200);
  await verify(page,email); await signin(page,email);
  await expect(page).toHaveURL(/\/member\/account$/); expect(await page.locator('body').innerText()).not.toContain('Another Sponsor');
  expect((await db`SELECT sponsor_last FROM member_handoff_claims WHERE account_id IN (SELECT account_id FROM member_credentials WHERE email=${email}) AND sponsor_last='Another Sponsor'`).length).toBe(1);
  expect((await db`SELECT 1 FROM member_credentials WHERE email=${email}`).length).toBe(1);
});

test('invalid, expired, reused, revoked and wrong-identity codes cannot activate accounts', async ({ page }) => {
  for (const index of [2,3,4,5,99]) {
    const email = `denied${index}@example.test`, code = `FREE-SYN${String(index).padStart(5,'0')}`;
    await signup(page,email,code); await verify(page,email); await signin(page,email);
    await expect(page.locator('main').getByRole('alert')).toBeVisible();
    expect((await db`SELECT 1 FROM member_credentials WHERE email=${email}`).length).toBe(0);
    expect((await db`SELECT 1 FROM user_accounts a JOIN candidates c ON c.id=a.candidate_id WHERE c.email=${email}`).length).toBe(0);
  }
});

test('verification expiry/reuse and reset expiry leave the account/password unchanged', async ({ page }) => {
  const email = 'expired-link@example.test'; await signup(page,email,'FREE-SYN00028'); const link = await mailbox(email);
  await db`UPDATE member_challenges SET expires_at=now()-interval '1 minute' WHERE kind='verify' AND handoff_key IN (SELECT key_hash FROM member_handoffs WHERE payload->>'me'=${email})`;
  await page.goto(link); await page.getByRole('button',{name:'Confirm my email'}).click(); await expect(page.locator('main').getByRole('alert')).toContainText("This link can't be used");
  expect((await post(page,{action:'begin'})).status()).toBe(200); const fresh = await mailbox(email); const token = new URLSearchParams(new URL(fresh).hash.slice(1)).get('token');
  await page.goto(fresh); await page.getByRole('button',{name:'Confirm my email'}).click(); await expect(page).toHaveURL(/\/signin$/);
  expect((await post(page,{action:'verify',token})).status()).toBe(400);
  await signin(page,email); await expect(page).toHaveURL(/\/member\/account$/);
  await page.goto('/signin'); await page.getByRole('button',{name:'Forgot password?'}).click(); await page.getByLabel('Email',{exact:true}).fill(email); await page.getByRole('button',{name:'Request reset link'}).click();
  const reset = await mailbox(email,'reset');
  await db`UPDATE member_challenges SET expires_at=now()-interval '1 minute' WHERE kind='reset' AND account_id IN (SELECT account_id FROM member_credentials WHERE email=${email})`;
  await page.goto(reset); await page.getByLabel('Password',{exact:true}).fill('Never-applied-password'); await page.getByLabel('Confirm password').fill('Never-applied-password'); await page.getByRole('button',{name:'Reset password',exact:true}).click();
  await expect(page.locator('main').getByRole('alert')).toContainText("This link can't be used");
  await page.goto('/signin'); await signin(page,email); await expect(page).toHaveURL(/\/member\/account$/);
});


test('a member using a configured staff email still cannot enter staff APIs', async ({ page }) => {
  await active(page, 'admin@example.test', 'FREE-SYN00029');
  const session = await (await page.request.get('/api/auth/session')).json();
  expect(session.user.id).toMatch(/^member:/);
  expect((await page.request.get('/api/recruitment/command')).status()).toBe(401);
  expect((await page.request.get('/api/admin/candidates')).status()).toBe(401);
});


test('a pending signup cannot squat another handoff or activate with its password', async ({page,browser}) => {
  const owner=await browser.newPage({baseURL:ORIGIN}), email='no-squatting@example.test';
  try {
    await signup(page,email,'FREE-SYN00030','Squatter-password-8');
    await signup(owner,email,'FREE-SYN00031','Owner-password-8');
    await verify(owner,email); await signin(owner,email,'Owner-password-8');
    await expect(owner).toHaveURL(/\/member\/account$/);
    await page.goto('/signin'); await signin(page,email,'Squatter-password-8');
    await expect(page).toHaveURL(/\/signup-done$/); // Generic proof flow; no account-state disclosure.
    expect((await (await page.request.get('/api/auth/session')).json())?.user).toBeUndefined();
    await page.goto('/member/account'); await expect(page.getByRole('heading',{name:'Sign in to continue'})).toBeVisible();
    expect((await db`SELECT 1 FROM member_credentials WHERE email=${email}`).length).toBe(1);
  } finally { await owner.close(); }
});
