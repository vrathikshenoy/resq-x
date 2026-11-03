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
test('route scoring, shortest vs weighted paths and disconnected streets',async()=>{
 const {demoGraph,shortestPath,edgeCost,lighting,routeRequest,graphFromOSM}=await import('../backend/routing.mjs');
 const graph=demoGraph(),short=shortestPath(graph,'0','15',false),weighted=shortestPath(graph,'0','15',true);
 assert.ok(short.distance<=weighted.distance);assert.ok(weighted.cost<=short.cost);assert.equal(weighted.lit_percent,100);assert.notDeepEqual(short.coordinates,weighted.coordinates);
 assert.equal(edgeCost({length:100,lit:'unknown',activity:0},true),375);assert.equal(lighting(undefined),'unknown');assert.equal(lighting('no'),'no');
 assert.throws(()=>shortestPath({nodes:graph.nodes,edges:[]},'0','15',true),/No connected/);
 await assert.rejects(()=>routeRequest({mode:'live',origin:[91,0],destination:[0,0]}),/valid latitude/);
 await assert.rejects(()=>routeRequest({mode:'demo',origin:'0',destination:'0'}),/different/);
 const network=graphFromOSM([{type:'node',id:1,lat:0,lon:0},{type:'node',id:2,lat:0,lon:.001},{type:'way',nodes:[1,2],tags:{highway:'footway','oneway:foot':'yes',lit:'yes'}},{type:'way',nodes:[1,2],tags:{highway:'motorway'}}]);assert.equal(network.edges.length,1);assert.equal(network.edges[0].lit,'yes');
 const user=await call('/api/v1/auth/demo',{});const route=await call('/api/v1/navigation/route',{mode:'demo',origin:'0',destination:'15'},user.cookie);assert.equal(route.status,200);assert.match(route.body.attribution,/Fictional/);
});
test('photo simulation enforces per-channel bounds, preserves alpha and validates formats',async()=>{
 const {perturbPixels,validateImageHeader}=await import('../src/lib/photo.mjs');
 const original=new Uint8ClampedArray([0,255,128,77,250,5,100,255]);const result=perturbPixels(original,8,()=>.99);
 assert.equal(original[2],128);assert.equal(result.pixels[3],77);assert.equal(result.pixels[7],255);assert.ok(result.maxDelta<=8);assert.ok(result.psnr>20);assert.equal(result.pixels[1],255);
 const low=perturbPixels(original,8,()=>0);assert.equal(low.pixels[0],0);assert.ok(low.maxDelta<=8);
 assert.throws(()=>perturbPixels(original,9),/budget/);assert.throws(()=>validateImageHeader(new Uint8Array([1,2,3]),'image/png',3),/valid JPEG/);
 assert.throws(()=>validateImageHeader(new Uint8Array(12),'image/png',11*1024*1024),/10 MB/);
 validateImageHeader(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png',100);
});
test('tracking requires separate sessions and movement; trusted devices suppress warnings',async()=>{
 const {appendObservation,summarizeDevice,approximateDistance}=await import('../src/lib/tracking.mjs');let devices=[];
 for(let i=0;i<3;i++)devices=appendObservation(devices,{id:'tag',name:'Sample tag',rssi:-60+i,time:i,session:'session-'+i,moved:i>0});
 assert.equal(summarizeDevice(devices[0].observations).persistent,true);assert.equal(summarizeDevice(devices[0].observations,true).persistent,false);
 assert.equal(summarizeDevice(devices[0].observations.map(o=>({...o,session:'one'}))).persistent,false);assert.equal(summarizeDevice(devices[0].observations.map(o=>({...o,moved:false}))).persistent,false);
 assert.equal(approximateDistance(-59,-59,2),1);assert.throws(()=>approximateDistance(-59,-59,0),/calibration/);
 for(let i=0;i<40;i++)devices=appendObservation(devices,{id:'tag',name:'Sample tag',rssi:-60,time:i,session:'extra',moved:false});assert.equal(devices[0].observations.length,30);
});
