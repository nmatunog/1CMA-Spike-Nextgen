import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mock=vi.hoisted(()=>({service:vi.fn(),issue:vi.fn(),consume:vi.fn(),signup:vi.fn(),limit:vi.fn()}));
vi.mock('./runtime',()=>({memberService:mock.service}));
vi.mock('./transport',()=>({issueTicket:mock.issue,consumeTicket:mock.consume}));
import {POST} from '../../app/api/member/preview-signup/route';
import {VERSA_PREVIEW_COOKIE} from './versa-preview';
const query=new URLSearchParams({mfn:'Test',mln:'Member',me:'test@example.test',sfn:'Test',sln:'Sponsor',code:'FREE-SYN00032'}).toString();
function request(host='127.0.0.1:3002',body:object={password:'Synthetic-password-8',confirm:'Synthetic-password-8'},origin?:string){const base=host.startsWith('127')?'http://'+host:'https://'+host;return new NextRequest(base+'/api/member/preview-signup',{method:'POST',headers:{origin:origin||base,'content-type':'application/json',cookie:`${VERSA_PREVIEW_COOKIE}=${query}`},body:JSON.stringify(body)});}
beforeEach(()=>{vi.stubEnv('MEMBER_PUBLIC_ORIGIN','http://127.0.0.1:3002');vi.stubEnv('MEMBER_LOCAL_DEMO','true');vi.stubEnv('VERSA_GET_STAGING_ENABLED','true');mock.service.mockReturnValue({origin:'http://127.0.0.1:3002',limit:mock.limit,signup:mock.signup});mock.issue.mockResolvedValue('signed-test-ticket');mock.consume.mockResolvedValue('opaque-test-handoff');mock.signup.mockResolvedValue(undefined);});
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it('does not wire unsigned hosted previews to account storage even with the staging flag',async()=>{const r=await POST(request('nextgen-staging.nmatunog.workers.dev'));expect(r.status).toBe(503);expect(mock.service).not.toHaveBeenCalled();expect(mock.issue).not.toHaveBeenCalled();});
it('fails closed with missing flag',async()=>{vi.stubEnv('VERSA_GET_STAGING_ENABLED','');expect((await POST(request())).status).toBe(503);expect(mock.service).not.toHaveBeenCalled();});
it('rejects cross-origin and identity-field tampering before issuing any ticket',async()=>{expect((await POST(request('127.0.0.1:3002',{},'https://evil.example'))).status).toBe(403);expect((await POST(request('127.0.0.1:3002',{password:'Synthetic-password-8',confirm:'Synthetic-password-8',email:'other@example.test'}))).status).toBe(400);expect(mock.issue).not.toHaveBeenCalled();});
it('validates password minimum before any ticket or signup writes',async()=>{expect((await POST(request('127.0.0.1:3002',{password:'short',confirm:'short'}))).status).toBe(400);expect(mock.issue).not.toHaveBeenCalled();});
it('uses the signed ticket and existing signup only after explicit local POST',async()=>{const r=await POST(request());expect(r.status).toBe(200);expect(mock.issue).toHaveBeenCalledOnce();expect(mock.consume).toHaveBeenCalledWith(expect.anything(),'signed-test-ticket');expect(mock.signup).toHaveBeenCalledWith('opaque-test-handoff','Synthetic-password-8','Synthetic-password-8');expect(r.cookies.get('spike_member_handoff')?.value).toBe('opaque-test-handoff');expect(await r.text()).not.toContain('test@example.test');});
