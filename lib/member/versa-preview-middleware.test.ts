import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {middleware} from '../../middleware';
import {VERSA_PREVIEW_COOKIE} from './versa-preview';
beforeEach(()=>vi.stubEnv('VERSA_GET_STAGING_ENABLED','true'));
afterEach(()=>vi.unstubAllEnvs());
const fields={mln:'Example',mfn:'Test',me:'dennis@example2.test',sfn:'Test',sln:'Sponsor',code:'NBM-12345'};
it('direct page GET captures the same secure short-lived context then redirects cleanly',()=>{
 const r=middleware(new NextRequest('https://nextgen-staging.nmatunog.workers.dev/spike-preview?'+new URLSearchParams(fields)));
 const target=new URL(r.headers.get('x-middleware-rewrite')!);expect(target.pathname).toBe('/');expect(Object.fromEntries(target.searchParams)).toEqual(fields);
 expect(r.headers.get('cache-control')).toContain('no-store');expect(r.headers.get('referrer-policy')).toBe('no-referrer');
});
it('malformed combined/missing fields clear stale prefill and recover without a crash',()=>{
 const q=new URLSearchParams(fields);q.delete('sfn');q.set('sln','Sponsor@sfn=Test');
 const r=middleware(new NextRequest('https://nextgen-staging.nmatunog.workers.dev/spike-preview?'+q,{headers:{cookie:`${VERSA_PREVIEW_COOKIE}=old`}}));
 expect(r.status).toBe(303);expect(new URL(r.headers.get('location')!).search).toBe('');expect(r.cookies.get(VERSA_PREVIEW_COOKIE)?.value).toBe('');
});
it('does not capture when flag unset or hostname is not the designated host',()=>{
 for(const host of ['spike-asc.pages.dev','nextgen-staging.nmatunog.workers.dev']) {
  vi.stubEnv('VERSA_GET_STAGING_ENABLED',host.startsWith('spike-')?'true':'');
  const r=middleware(new NextRequest(`https://${host}/spike-preview?`+new URLSearchParams(fields)));
  expect(r.headers.get('x-middleware-next')).toBe('1');expect(r.headers.get('set-cookie')).toBeNull();
 }
});
it('leaves clean page requests alone and never emits values to console',()=>{
 const spies=['log','info','warn','error','debug'].map(k=>vi.spyOn(console,k as 'log').mockImplementation(()=>{}));
 try {const r=middleware(new NextRequest('https://nextgen-staging.nmatunog.workers.dev/spike-preview'));expect(r.headers.get('x-middleware-next')).toBe('1');middleware(new NextRequest('https://nextgen-staging.nmatunog.workers.dev/spike-preview?'+new URLSearchParams(fields)));for(const s of spies)expect(s).not.toHaveBeenCalled();}finally{spies.forEach(s=>s.mockRestore());}
});

it.each(['fbclid=abc','utm_source=fb','lang=ceb'])('ordinary query %s is left alone with no cookie changes',query=>{
 const r=middleware(new NextRequest('https://nextgen-staging.nmatunog.workers.dev/spike-preview?'+query,{headers:{cookie:'spike_member_handoff=existing; spike_versa_preview=existing'}}));
 expect(r.headers.get('x-middleware-next')).toBe('1');expect(r.headers.get('set-cookie')).toBeNull();
});
