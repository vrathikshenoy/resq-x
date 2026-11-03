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
