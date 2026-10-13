const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const ALLOWED_TIMES = new Set(['12:30','13:00','13:30','14:00','19:00','19:30','20:30','21:00']);
function json(data, status=200, extra={}) { return new Response(JSON.stringify(data), {status, headers:{...JSON_HEADERS,...extra}}); }
function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false; const d = new Date(value+'T12:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value; }
function minutes(time) { const [h,m]=time.split(':').map(Number); return h*60+m; }
function romeClock(now=new Date()) { const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now); const p=Object.fromEntries(parts.map(x=>[x.type,x.value])); return {date:`${p.year}-${p.month}-${p.day}`,minutes:Number(p.hour)*60+Number(p.minute)}; }
function cleanString(value,max) { return typeof value === 'string' ? value.trim().slice(0,max) : ''; }
export default {
 async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
   if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'86400','vary':'Origin'}});
   if (url.pathname === '/api/health' && request.method === 'GET') return json({ok:true,service:'armando-booking',timestamp:new Date().toISOString()});
   if (url.pathname === '/api/reservations' && request.method === 'POST') {
    let body; try { body=await request.json(); } catch { return json({error:'Dati non validi. Controlla il modulo.'},400); }
    const name=cleanString(body.name,100), phone=cleanString(body.phone,30), email=cleanString(body.email,254), date=body.date, time=body.time, guests=Number(body.guests), notes=cleanString(body.notes,1000);
    if (name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.replace(/[^0-9]/g,'').length<7 || !validDate(date) || !ALLOWED_TIMES.has(time) || !Number.isInteger(guests) || guests<1 || guests>6) return json({error:'Controlla nome, telefono, email, data, orario e numero di ospiti.'},422);
    const today = romeClock(); const todayStr = today.date;
    if (date < todayStr) return json({error:'La data scelta è già passata.'},422);
    if (new Date(date+'T12:00:00Z').getUTCDay()===0) return json({error:'Il ristorante è chiuso la domenica. Scegli un altro giorno.'},422);
    if (date===todayStr && minutes(time) <= today.minutes) return json({error:'Scegli un orario futuro.'},422);
    const id = env.BOOKING_COORDINATOR.idFromName('armando-main-room');
    return env.BOOKING_COORDINATOR.get(id).fetch('https://booking.internal/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,phone,email,date,time,guests,notes})});
   }
   if (url.pathname === '/api/admin/reservations') {
    if (!env.ADMIN_TOKEN) return json({error:'Configurazione admin incompleta.'},503);
    const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if (!token || token !== env.ADMIN_TOKEN) return json({error:'Non autorizzato.'},401);
    const id=env.BOOKING_COORDINATOR.idFromName('armando-main-room');
    return env.BOOKING_COORDINATOR.get(id).fetch('https://booking.internal/admin'+url.search,{method:request.method,headers:{'content-type':'application/json', ...(request.method==='POST'?{'x-admin-action':'1'}:{})},body:request.method==='POST'?await request.text():undefined});
   }
   return json({error:'Endpoint non trovato.'},404);
  }
  // Security headers on static pages; asset cache is handled by Cloudflare's asset pipeline.
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options','nosniff'); headers.set('referrer-policy','strict-origin-when-cross-origin'); headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');
  headers.set('content-security-policy',"default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }
};
export class BookingCoordinator {
 constructor(ctx, env) {
  this.ctx=ctx; this.env=env;
  this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS reservations (
   id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
   date TEXT NOT NULL, time TEXT NOT NULL, start_minutes INTEGER NOT NULL, guests INTEGER NOT NULL,
   notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
  )`);
  this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS reservations_date_status ON reservations(date,status,start_minutes)');
 }
 async fetch(request) {
  const url=new URL(request.url); const sql=this.ctx.storage.sql;
  if(url.pathname==='/create' && request.method==='POST') {
   let b; try{b=await request.json()}catch{return json({error:'Richiesta non valida.'},400)}
   // All conflict checks and insert run synchronously inside one SQLite transaction. DO serializes this critical section.
   try {
    const result=this.ctx.storage.transactionSync(()=>{
     const start=minutes(b.time), end=start+120;
     const active=sql.exec(`SELECT id,start_minutes FROM reservations WHERE date=? AND status IN ('pending','confirmed') AND start_minutes < ? AND start_minutes + 120 > ?`,b.date,end,start).toArray();
     if(active.length>=14) return {conflict:true};
     const id='ARM-'+crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase(); const now=new Date().toISOString();
     sql.exec(`INSERT INTO reservations(id,name,phone,email,date,time,start_minutes,guests,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)`,id,b.name,b.phone,b.email,b.date,b.time,start,b.guests,b.notes,now,now);
     return {id};
    });
    if(result.conflict) return json({error:'Questo orario è al completo. Scegli un altro orario o contattaci.'},409);
    return json({ok:true,id:result.id,status:'pending'},201);
   } catch(e) { console.error('BookingCoordinator create failed:', e?.name || 'UnknownError'); return json({error:'Non è stato possibile salvare la richiesta. Riprova tra poco.'},500); }
  }
  if(url.pathname==='/admin' && request.method==='GET') {
   const date=url.searchParams.get('date');
   const rows=date ? sql.exec('SELECT id,name,phone,email,date,time,guests,notes,status,created_at FROM reservations WHERE date=? ORDER BY time',date).toArray() : sql.exec('SELECT id,name,phone,email,date,time,guests,notes,status,created_at FROM reservations ORDER BY date DESC,time LIMIT 300').toArray();
   return json({reservations:rows});
  }
  if(url.pathname==='/admin' && request.method==='POST') {
   let b;try{b=await request.json()}catch{return json({error:'Richiesta non valida.'},400)}
   if(!b.id || !['confirmed','cancelled'].includes(b.status)) return json({error:'Azione non valida.'},422);
   const row=sql.exec('SELECT id,date,time,status FROM reservations WHERE id=?',b.id).toArray()[0];
   if(!row) return json({error:'Prenotazione non trovata.'},404);
   if(b.status==='confirmed' && row.status==='cancelled') return json({error:'Una prenotazione annullata non può essere confermata.'},409);
   if(b.status==='confirmed') {
    const start=minutes(row.time); const active=sql.exec(`SELECT id FROM reservations WHERE date=? AND id<>? AND status IN ('pending','confirmed') AND start_minutes < ? AND start_minutes + 120 > ?`,row.date,row.id,start+120,start).toArray();
    if(active.length>=14) return json({error:'Capacità raggiunta per questo intervallo.'},409);
   }
   sql.exec('UPDATE reservations SET status=?,updated_at=? WHERE id=?',b.status,new Date().toISOString(),b.id);
   return json({ok:true,id:b.id,status:b.status});
  }
  return json({error:'Endpoint non trovato.'},404);
 }
}
