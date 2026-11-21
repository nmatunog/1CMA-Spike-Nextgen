// Local synthetic sample issuer. Prints only a short-lived opaque browser link.
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';
const { secret } = JSON.parse(await readFile('work/member-issuer.json', 'utf8'));
const body = JSON.stringify({ mfn:'Demo',mln:'Member',me:'demo@example.test',sfn:'Test',sln:'Sponsor',code:'FREE-SYN00001',campaign:'synthetic-demo' });
const timestamp=String(Math.floor(Date.now()/1000)), nonce=randomBytes(32).toString('hex');
const signature=createHmac('sha256',secret).update(`versa-issuer-v1\n${timestamp}\n${nonce}\n${body}`).digest('hex');
const response=await fetch('http://127.0.0.1:3002/api/member/handoff',{method:'POST',headers:{'content-type':'application/json','x-versa-timestamp':timestamp,'x-versa-nonce':nonce,'x-versa-signature':signature},body});
if (!response.ok) throw new Error('Local synthetic issuer unavailable');
console.log((await response.json()).url);
