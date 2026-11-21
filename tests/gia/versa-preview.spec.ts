import { test, expect, type Page } from '@playwright/test';
import postgres from 'postgres';
const db=postgres(process.env.GIA_TEST_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:55432/postgres',{max:1,prepare:false});
test.beforeEach(()=>test.skip(process.env.MEMBER_LOCAL_DEMO!=='true','Explicit local synthetic member harness required'));
test.afterAll(async()=>db.end());
const fields=(n:string,code='FREE-SYN00032')=>({mfn:`Test${n}`,mln:'Member',me:`compat${n}@example.test`,sfn:'Test',sln:'Sponsor',code});
async function snapshot(){return (await db`SELECT (SELECT count(*) FROM user_accounts) AS accounts,(SELECT count(*) FROM member_credentials) AS credentials,(SELECT count(*) FROM member_handoffs) AS handoffs,(SELECT count(*) FROM member_code_claims) AS codes,(SELECT count(*) FROM member_handoff_claims) AS claims,(SELECT count(*) FROM member_pending_signups) AS pending`)[0];}
async function mail(email:string,kind='verify') {const [row]=await db`SELECT link FROM member_local_mail WHERE destination=${email} AND kind=${kind} ORDER BY created_at DESC LIMIT 1`;return String(row.link);}
async function login(page:Page,email:string,password:string){await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();}
for (const [width,code] of [[390,'FREE-SYN00032'],[768,'FREE-SYN00033'],[1440,'FREE-SYN00034']] as const) {
 test(`GET → password → verification → signin → GIA at ${width}px`,async({page})=>{
  const data=fields(String(width),code),password='Synthetic-compat-password-8';
  await page.setViewportSize({width,height:width===390?844:900});
  const before=await snapshot();await page.goto('/?'+new URLSearchParams(data));
  await expect(page).toHaveURL(/\/spike-preview$/);
  await expect(page.getByRole('heading',{name:`Welcome, Test${width}.`})).toBeVisible();
  await expect(page.getByText(data.code,{exact:true})).toBeHidden();
  await page.screenshot({path:`docs/screenshots/versa-get/welcome-${width}.png`,fullPage:true});
  await page.getByText('Your Versa details',{exact:true}).click();
  for(const text of [`${data.mfn} ${data.mln}`,data.me,'Test Sponsor',data.code]) await expect(page.getByText(text,{exact:true})).toBeVisible();
  await page.reload();expect(await snapshot()).toEqual(before); // GET and refresh have zero DB side effects.
  const cookies=await page.context().cookies();const preview=cookies.find(c=>c.name==='spike_versa_preview');expect(preview?.httpOnly).toBe(true);
  const root=await page.request.get('/?'+new URLSearchParams(data),{maxRedirects:0});expect(root.headers()['cache-control']).toContain('no-store');expect(root.headers()['referrer-policy']).toBe('no-referrer');
  await page.getByRole('link',{name:'Let’s get started',exact:true}).click();await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByLabel('Email (your username)',{exact:true})).toHaveValue(data.me);await expect(page.getByLabel('Email (your username)',{exact:true})).toHaveAttribute('readonly','');
  await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Show passwords'}).click();await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');await page.getByRole('button',{name:'Hide passwords'}).click();
  await page.getByLabel('Password',{exact:true}).fill('');await page.getByLabel('Confirm password',{exact:true}).fill('');
  await page.screenshot({path:`docs/screenshots/versa-get/password-${width}.png`,fullPage:true});
  await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create account & meet GIA'}).click();await expect(page).toHaveURL(/\/signup-done$/);await expect(page.getByText(/No email was sent/)).toBeVisible();
  expect((await db`SELECT 1 FROM member_credentials WHERE email=${data.me}`).length).toBe(0);expect((await db`SELECT 1 FROM candidates WHERE email=${data.me}`).length).toBe(0);
  await page.goto(await mail(data.me));await page.getByRole('button',{name:'Confirm my email'}).click();await expect(page).toHaveURL(/\/signin$/);
  await login(page,data.me,password);await expect(page).toHaveURL(/\/gia$/);expect((await (await page.request.get('/api/auth/session')).json()).user.id).toMatch(/^member:/);await page.getByRole('button',{name:'What is this?',exact:true}).click();await expect(page.getByText(/SPIKE is a guided pathway/)).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(/KP-[A-Z]+-\d+|· v\d/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`docs/screenshots/versa-get/gia-${width}.png`,fullPage:true});
  expect((await db`SELECT 1 FROM member_credentials WHERE email=${data.me}`).length).toBe(1);
  if(width===390){
   await page.goto('/member/account');await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/signin$/);
   await login(page,data.me,password);await expect(page).toHaveURL(/\/gia$/);
   await page.goto('/signin');await page.getByRole('button',{name:'Forgot password?'}).click();await page.getByLabel('Email',{exact:true}).fill(data.me);await page.getByRole('button',{name:'Request reset link'}).click();await expect(page.getByRole('status')).toContainText('does not send email');
   const link=await mail(data.me,'reset'),token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');await page.goto(link);
   await page.getByLabel('Password',{exact:true}).fill('Synthetic-reset-password-8');await page.getByLabel('Confirm password',{exact:true}).fill('Synthetic-reset-password-8');await page.getByRole('button',{name:'Reset password',exact:true}).click();await expect(page.getByText('Password changed.')).toBeVisible();
   const replay=await page.request.post('/api/member',{headers:{origin:'http://127.0.0.1:3002'},data:{action:'reset',token,password,confirm:password}});expect(replay.status()).toBe(400);
   await page.goto('/signin');await login(page,data.me,'Synthetic-reset-password-8');await expect(page).toHaveURL(/\/gia$/);
  }
 });
}
test('malformed, duplicate and oversized fields fail without DB effects',async({page})=>{
 const base=fields('invalid');const before=await snapshot();
 const bad=[{...base,me:'x'.repeat(121)},{...base,mfn:'x'.repeat(81)},{...base,code:'x'.repeat(33)},{...base,mfn:'bad\nname'}];
 const queries=bad.map(v=>new URLSearchParams(v).toString());queries.push(new URLSearchParams({...base,extra:'unexpected'}).toString());const duplicate=new URLSearchParams(base);duplicate.append('me','other@example.test');queries.push(duplicate.toString());const missing=new URLSearchParams(base);missing.delete('sfn');queries.push(missing.toString());
 for(const q of queries){await page.goto('/?'+q);await expect(page).toHaveURL(/\/signup$/);await expect(page.getByRole('heading',{name:'Open your Versa handoff'})).toBeVisible();expect(await page.context().cookies()).not.toEqual(expect.arrayContaining([expect.objectContaining({name:'spike_versa_preview',value:expect.stringContaining('compat')})]));}
 expect(await snapshot()).toEqual(before);
 await page.goto('/?'+new URLSearchParams({...base,mfn:'<img src=x onerror=alert(1)>'}));await expect(page.getByRole('heading')).toContainText('<img src=x onerror=alert(1)>');expect(await page.locator('h1 img').count()).toBe(0);
});
