import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
test.beforeEach(()=>test.skip(process.env.VERSA_CAPTURE_ONLY!=='true','No-member-service preview server required'));
for(const path of ['/','/spike-preview']) {
 test(`${path} captures arbitrary formats, prefills forms, and submit stays unavailable`,async({page})=>{
  const logs:string[]=[];page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
  const fields={mln:'Example',mfn:'Preview',me:'dennis@hismail.example',sfn:'Test',sln:'Sponsor',code:path==='/'?'12345678':'NBM-12345'};
  const response=await page.request.get(path+'?'+new URLSearchParams(fields),{maxRedirects:0});expect(response.status()).toBe(303);expect(response.headers()['location']).toMatch(/\/spike-preview$/);expect(response.headers()['cache-control']).toContain('no-store');expect(response.headers()['referrer-policy']).toBe('no-referrer');
  await page.goto(path+'?'+new URLSearchParams(fields));await expect(page).toHaveURL(/\/spike-preview$/);await expect(page.getByRole('heading',{name:'Welcome, Preview.'})).toBeVisible();
  await page.getByText('Your Versa details',{exact:true}).click();for(const v of ['Preview Example',fields.me,'Test Sponsor',fields.code])await expect(page.getByText(v,{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Let’s get started',exact:true}).click();await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByLabel('Email (your username)',{exact:true})).toHaveValue(fields.me);await expect(page.getByLabel('Email (your username)',{exact:true})).toHaveAttribute('readonly','');await expect(page.getByText('Preview Example',{exact:true})).toBeVisible();await expect(page.getByText(fields.code,{exact:true})).toBeVisible();await expect(page.getByLabel('Password',{exact:true})).toBeEmpty();await expect(page.getByLabel('Confirm password',{exact:true})).toBeEmpty();
  await page.getByLabel('Password',{exact:true}).fill('Synthetic-preview-password-8');await page.getByLabel('Confirm password',{exact:true}).fill('Synthetic-preview-password-8');const post=page.waitForResponse(r=>r.url().endsWith('/api/member/preview-signup'));await page.getByRole('button',{name:'Create account & meet GIA'}).click();expect((await post).status()).toBe(503);await expect(page.locator('main').getByRole('alert')).toContainText('not connected on this host');await expect(page).toHaveURL(/\/signup$/);
  await page.goto('/signin');await expect(page.getByLabel('Email',{exact:true})).toHaveValue(fields.me);
  await page.goBack();expect(new URL(page.url()).search).toBe('');await page.goBack();await expect(page).toHaveURL(/\/spike-preview$/);
  if(process.env.CAPTURE_SERVER_LOG){const serverLog=readFileSync(process.env.CAPTURE_SERVER_LOG,'utf8');expect(serverLog).not.toContain(fields.me);expect(serverLog).not.toContain(fields.code);}
  expect(logs.join('\n')).not.toContain(fields.me);expect(logs.join('\n')).not.toContain(fields.code);
 });
}
test('direct malformed query clears stale context; missing fields show plain landing',async({page})=>{
 const q=new URLSearchParams({mfn:'Preview',mln:'Example',me:'not-an-email',sfn:'Test',sln:'Sponsor',code:'any code!'});
 await page.goto('/spike-preview?'+q);await expect(page.getByRole('heading',{name:'Welcome, Preview.'})).toBeVisible();
 q.delete('sfn');q.set('sln','Sponsor@sfn=Test');await page.goto('/spike-preview?'+q);await expect(page).toHaveURL(/\/spike-preview$/);await expect(page.getByRole('heading',{name:'Ask GIA. Start free.'})).toBeVisible();await expect(page.getByText('Welcome, Preview.')).toHaveCount(0);expect((await page.context().cookies()).find(c=>c.name==='spike_versa_preview')).toBeUndefined();
 await page.goto('/signup');await expect(page.getByRole('heading',{name:'Open your Versa handoff'})).toBeVisible();
});
