import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_PATH=':memory:';
const { createApp }=await import('../backend/server.mjs');
const { features }=await import('../backend/features.mjs');
const app=createApp(features);
const {Readable}=await import('node:stream');
async function call(path,data,cookie,method=data?'POST':'GET',extra={}){
 const headers={host:'localhost',...(data?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...extra};
 const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);Object.assign(req,{url:path,method,headers,socket:{remoteAddress:'127.0.0.1'}});
 return new Promise(resolve=>{const h={};const res={status:200,setHeader(k,v){h[k.toLowerCase()]=v},writeHead(status,values){this.status=status;Object.entries(values||{}).forEach(([k,v])=>this.setHeader(k,v))},end(bytes){resolve({status:this.status,body:JSON.parse(bytes),cookie:h['set-cookie']?.split(';')[0]})}};app.emit('request',req,res)});
}
test('health and authentication session lifecycle',async()=>{
 assert.equal((await call('/health')).body.status,'ok');assert.equal((await call('/api/v1/auth/me')).status,401);
 assert.equal((await call('/api/v1/auth/register',{email:'bad',password:'short'})).status,422);
 const account=await call('/api/v1/auth/register',{name:'Test User',email:'test@example.com',password:'a-secure-test-password'});assert.equal(account.status,200);assert.ok(account.cookie.includes('resqx_session='));
 assert.equal((await call('/api/v1/auth/me',null,account.cookie)).body.name,'Test User');
 assert.equal((await call('/api/v1/auth/login',{email:'test@example.com',password:'wrong-password'})).status,401);
 assert.equal((await call('/api/v1/auth/login',{email:'test@example.com',password:'a-secure-test-password'})).status,200);
 assert.equal((await call('/api/v1/auth/logout',{},account.cookie)).status,200);assert.equal((await call('/api/v1/auth/me',null,account.cookie)).status,401);
});
test('origin and content type validation',async()=>{
 assert.equal((await call('/api/v1/auth/demo',{},null,'POST',{origin:'https://untrusted.example'})).status,403);
 assert.equal((await call('/api/v1/auth/demo',null,null,'POST')).status,415);
});
test('contact ownership, validation, verification and idempotent mock alerts',async()=>{
 const a=await call('/api/v1/auth/demo',{}),b=await call('/api/v1/auth/demo',{});
 const path='/api/v1/contacts';assert.equal((await call(path,{name:'Friend',phone:'123',relation:'Friend'},a.cookie)).status,422);
 const c=await call(path,{name:'Ananya',phone:'+919876543210',relation:'Friend'},a.cookie);assert.equal(c.status,201);
 assert.equal((await call(path,null,b.cookie)).body.length,0);
 assert.equal((await call(path+'/'+c.body.id,undefined,b.cookie,'DELETE')).status,404);
 const alert={request_id:'test-alert-request-001',type:'manual',location:null};assert.equal((await call('/api/v1/alerts/trigger',alert,a.cookie)).status,409);
 await call(path+'/'+c.body.id,{verify_simulation:true},a.cookie,'PATCH');
 const first=await call('/api/v1/alerts/trigger',alert,a.cookie),second=await call('/api/v1/alerts/trigger',alert,a.cookie);assert.equal(first.status,201);assert.equal(second.status,200);assert.equal(first.body.id,second.body.id);assert.equal(first.body.simulation,true);assert.equal(first.body.recipients[0].status,'simulated_delivered');
 assert.equal((await call('/api/v1/alerts',null,a.cookie)).body.length,1);assert.equal((await call('/api/v1/alerts',null,b.cookie)).body.length,0);
 assert.equal((await call('/api/v1/alerts/trigger',{...alert,request_id:'invalid-location',location:{latitude:95,longitude:0}},a.cookie)).status,422);
 await call(path+'/'+c.body.id,{name:'Ananya',phone:'+919876543211',relation:'Friend'},a.cookie,'PUT');assert.equal((await call(path,null,a.cookie)).body[0].verified,0);
});
