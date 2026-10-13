import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
function envWithCoordinator(handler=async()=>new Response(JSON.stringify({ok:true,id:'ARM-TEST12345',status:'pending'}),{status:201,headers:{'content-type':'application/json'}})) {
 let called=0;
 return { env:{BOOKING_COORDINATOR:{idFromName:()=>({}),get:()=>({fetch:async(...args)=>{called++;return handler(...args)}})},ASSETS:{fetch:async()=>new Response('asset')}}, calls:()=>called };
}
test('health endpoint responds without touching booking storage', async()=>{
 const m=envWithCoordinator(); const r=await worker.fetch(new Request('https://site.test/api/health'),m.env); assert.equal(r.status,200); assert.equal((await r.json()).ok,true); assert.equal(m.calls(),0);
});
test('invalid reservation payload is rejected before storage', async()=>{
 const m=envWithCoordinator(); const r=await worker.fetch(new Request('https://site.test/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'A',email:'bad',phone:'1',date:'2020-01-01',time:'25:99',guests:99})}),m.env); assert.equal(r.status,422); assert.equal(m.calls(),0);
});
test('Sunday reservation is rejected', async()=>{
 const m=envWithCoordinator(); const r=await worker.fetch(new Request('https://site.test/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Mario Rossi',email:'mario@example.com',phone:'+39123456789',date:'2026-10-18',time:'19:00',guests:2})}),m.env); assert.equal(r.status,422); assert.equal(m.calls(),0);
});
test('valid reservation delegates to coordinator', async()=>{
 const m=envWithCoordinator(); const r=await worker.fetch(new Request('https://site.test/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Mario Rossi',email:'mario@example.com',phone:'+39123456789',date:'2026-10-17',time:'19:00',guests:2,notes:''})}),m.env); assert.equal(r.status,201); assert.equal(m.calls(),1);
});
test('admin endpoint rejects missing token', async()=>{
 const m=envWithCoordinator(); m.env.ADMIN_TOKEN='test-secret'; const r=await worker.fetch(new Request('https://site.test/api/admin/reservations'),m.env); assert.equal(r.status,401); assert.equal(m.calls(),0);
});

test('admin endpoint rejects unsupported methods', async()=>{
 const m=envWithCoordinator(); m.env.ADMIN_TOKEN='test-secret';
 const r=await worker.fetch(new Request('https://site.test/api/admin/reservations',{method:'DELETE',headers:{authorization:'Bearer test-secret'}}),m.env);
 assert.equal(r.status,405); assert.equal(r.headers.get('allow'),'GET, POST'); assert.equal(m.calls(),0);
});
test('WhatsApp support is available on the homepage and booking page', async()=>{
 const home = await (await import('node:fs/promises')).readFile(new URL('../public/index.html', import.meta.url),'utf8');
 const booking = await (await import('node:fs/promises')).readFile(new URL('../public/prenota.html', import.meta.url),'utf8');
 assert.match(home,/https:\/\/wa\.me\/213674361675/);
 assert.match(booking,/https:\/\/wa\.me\/213674361675/);
});
