import {test,expect} from '@playwright/test';
import postgres from 'postgres';
import {createHmac,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
const db=postgres(process.env.GIA_TEST_DATABASE_URL||'postgres://postgres@127.0.0.1:55432/member_hardening_test',{max:1,prepare:false});
test.beforeEach(()=>test.skip(process.env.MEMBER_STAGING_SKIP_TEST!=='true','Staging skip switch harness required'));
test.afterAll(async()=>db.end());
for(const mode of ['preview','signed'])test(`${mode} signup activates without mail; staging reset is unavailable`,async({page})=>{
 const email=`stage-${mode}@example.test`,password='Synthetic-stage-password-8';
 const fields={mfn:'Staging',mln:'Member',me:email,sfn:'Test',sln:'Sponsor',code:mode==='preview'?'FREE-SYN00035':'FREE-SYN00036'};
 let arrival='/?'+new URLSearchParams(fields);
 if(mode==='signed'){
  const body=JSON.stringify(fields),{secret}=JSON.parse(readFileSync('work/member-issuer.json','utf8'));
  const timestamp=String(Math.floor(Date.now()/1000)),nonce=randomBytes(32).toString('hex');const signature=createHmac('sha256',secret).update(`versa-issuer-v1\n${timestamp}\n${nonce}\n${body}`).digest('hex');
  const r=await page.request.post('/api/member/handoff',{headers:{'content-type':'application/json','x-versa-timestamp':timestamp,'x-versa-nonce':nonce,'x-versa-signature':signature},data:body});expect(r.status()).toBe(200);arrival=(await r.json()).url;
 }
 await page.goto(arrival);if(mode==='preview')await page.getByRole('link',{name:'Let’s get started',exact:true}).click();
 await expect(page).toHaveURL(/\/signup$/);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);await page.getByRole('button',{name:mode==='preview'?'Create account & meet GIA':'Create my account',exact:true}).click();await expect(page).toHaveURL(/\/signin$/);
 const [account]=await db`SELECT a.status,c.email_verified,m.email_verified_at FROM user_accounts a JOIN candidates c ON c.id=a.candidate_id JOIN member_credentials m ON m.account_id=a.id WHERE m.email=${email}`;
 expect(account.status).toBe('active');expect(account.email_verified).toBe(true);expect(account.email_verified_at).toBeTruthy();expect((await db`SELECT 1 FROM member_local_mail WHERE destination=${email}`).length).toBe(0);
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(mode==='preview'?/\/gia$/:/\/member\/account$/);
 expect((await (await page.request.get('/api/auth/session')).json()).user.id).toMatch(/^member:/);
 await page.goto('/signin');await page.getByRole('button',{name:'Forgot password?',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:'Request reset link'}).click();await expect(page.getByRole('status')).toHaveText("Password reset isn't available on staging yet");expect((await db`SELECT 1 FROM member_local_mail WHERE destination=${email}`).length).toBe(0);
});
