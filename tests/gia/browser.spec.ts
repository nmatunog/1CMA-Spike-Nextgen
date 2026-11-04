import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
for (const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
  test(`GIA disclosure, consent and layout ${viewport.width}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.goto('/gia');
    await expect(page.getByRole('heading',{name:'GIA — Your 1CMA AI Guide'})).toBeVisible();
    await expect(page.getByText(/an AI assistant/)).toBeVisible();
    await expect(page.getByRole('button',{name:'Save consent and contact'})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Save leader request'})).toBeDisabled();
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:`work/gia-${viewport.width}.png`,fullPage:true});
  });
}
test('anonymous visitors cannot access records or legacy admin APIs', async ({page,request}) => {
  await page.goto('/recruitment/command');
  await expect(page.getByText('Authorized staff access required.')).toBeVisible();
  for (const url of ['/api/recruitment/command','/api/admin/candidates']) {
    expect((await request.get(url,{headers:{Cookie:'admin_verified=1'}})).status()).toBe(401);
  }
});
test('pilot backend defaults to disabled', async ({request}) => {
  if (process.env.GIA_PILOT_ENABLED === 'true') test.skip();
  const response = await request.post('/api/gia',{data:{action:'message',text:'hello'}});
  expect(response.status()).toBe(503);expect(await response.json()).toEqual({error:'pilot_disabled'});
});
test('synthetic consent, Bisaya, booking, handoff and authorized follow-up', async ({page,browser}) => {
  test.skip(process.env.GIA_PILOT_ENABLED !== 'true');
  await page.goto('/gia');
  await page.getByLabel('Name',{exact:true}).fill('Synthetic Pilot Visitor');
  await page.getByLabel('Email',{exact:true}).fill('visitor@example.test');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Save consent and contact'}).click();
  await expect(page.getByText('Your consent and contact have been saved for recruitment follow-up.')).toBeVisible();
  await page.getByRole('button',{name:'Join Free Financial Literacy'}).click();
  await expect(page.getByText('I do not have an approved answer for that yet. I can connect you with a 1CMA leader.')).toBeVisible();
  await page.getByRole('textbox',{name:'Message GIA'}).fill('Bisaya');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await expect(page.getByText('Sige, mag-Bisaya ta. Unsa akong ikatabang?')).toBeVisible();
  await page.getByRole('button',{name:'Show FEP sessions'}).click();
  await expect(page.getByRole('button',{name:'Book this FEP'})).toBeVisible();
  await page.getByRole('button',{name:'Book this FEP'}).click();
  await expect(page.getByText(/Your FEP booking is saved/)).toBeVisible();
  await page.getByRole('button',{name:'Save leader request'}).click();
  await expect(page.getByText(/Your leader request is saved/).last()).toBeVisible();
  const access = JSON.parse(await readFile('work/demo-access.json','utf8'));
  const staffContext=await browser.newContext();const staffPage=await staffContext.newPage();
  await staffPage.goto('/login');
  await staffPage.getByLabel('Email',{exact:true}).fill(access.email);
  await staffPage.getByLabel('Password',{exact:true}).fill(access.password);
  await staffPage.getByRole('button',{name:'Sign in',exact:true}).click();
  await staffPage.waitForURL('/');await staffPage.goto('/recruitment/command');
  await expect(staffPage.getByRole('heading',{name:'Synthetic Pilot Visitor'}).first()).toBeVisible();
  const form=staffPage.locator('form').first();
  await form.getByRole('combobox').selectOption('fep_booked');
  await form.getByLabel('Assigned leader email').fill(access.leaderEmail);
  await form.getByLabel('Next action').fill('Synthetic follow-up after FEP');
  await form.getByLabel('Resolution',{exact:true}).fill('Synthetic pilot checked');
  await form.getByRole('button',{name:'Save follow-up'}).click();
  await expect(staffPage.getByRole('status')).toHaveText('Follow-up saved');
  await staffPage.screenshot({path:'work/command-desktop.png',fullPage:true});
  await staffPage.setViewportSize({width:390,height:844});
  expect(await staffPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await staffPage.screenshot({path:'work/command-mobile.png',fullPage:true});
  const leaderContext=await browser.newContext();const leaderPage=await leaderContext.newPage();
  await leaderPage.goto('/login');await leaderPage.getByLabel('Email',{exact:true}).fill(access.leaderEmail);await leaderPage.getByLabel('Password',{exact:true}).fill(access.leaderPassword);
  await leaderPage.getByRole('button',{name:'Sign in',exact:true}).click();await leaderPage.waitForURL('/');await leaderPage.goto('/recruitment/command');
  await expect(leaderPage.getByRole('heading',{name:'Synthetic Pilot Visitor'}).first()).toBeVisible();
  const leaderForm=leaderPage.locator('form').first();
  await leaderForm.getByRole('combobox').selectOption('fep_attended');
  await leaderForm.getByRole('button',{name:'Save follow-up'}).click();
  await expect(leaderPage.getByRole('status')).toHaveText('Follow-up saved');
  const visible = await leaderContext.request.get('/api/recruitment/command');
  const records = (await visible.json()).candidates;
  expect(records.every((r:{assigned_leader:string})=>r.assigned_leader===access.leaderEmail)).toBe(true);
  await page.getByRole('button',{name:'STOP / opt out'}).click();
  await expect(page.getByText('You are opted out. No further follow-up will be sent.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Save leader request'})).toBeDisabled();
  await staffContext.close();
  await leaderContext.close();
});
