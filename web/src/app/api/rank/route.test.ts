import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { POST } from './route';
const send=(body:unknown)=>POST(new Request('http://localhost/api/rank',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
describe('bounded ranking input',()=>{
 it.each([null,[],{}, {query:'bad',part:0},{query:'v=2',part:-1},{query:'v=2',part:8},{query:'x'.repeat(5000),part:0}])('rejects malformed body %j',async body=>{const r=await send(body);expect(r.status).toBe(400);expect(r.headers.get('cache-control')).toBe('private, no-store');});
 it('rejects malformed JSON',async()=>{const r=await POST(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'}));expect(r.status).toBe(400);});
});
