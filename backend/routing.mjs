import {fail} from './server.mjs';
export function distance(a,b){const rad=Math.PI/180,dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;const h=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function lighting(value){return ['yes','automatic','24/7'].includes(value)?'yes':['no'].includes(value)?'no':'unknown';}
export function edgeCost(e,weighted){const lit=e.lit==='yes'?1:e.lit==='no'?0:.5;return e.length*(weighted?1+2.5*(1-lit)+1.5*(1-e.activity):1);}
export function shortestPath(graph,start,end,weighted){
 const adjacent=new Map();for(const e of graph.edges){if(!adjacent.has(e.from))adjacent.set(e.from,[]);adjacent.get(e.from).push(e);}
 const costs=new Map([[start,0]]),previous=new Map(),queue=[[0,start]];
 function push(item){queue.push(item);let i=queue.length-1;while(i>0){const p=(i-1)>>1;if(queue[p][0]<=item[0])break;queue[i]=queue[p];i=p;}queue[i]=item;}
 function pop(){const first=queue[0],last=queue.pop();if(queue.length){let i=0;while(2*i+1<queue.length){let j=2*i+1;if(j+1<queue.length&&queue[j+1][0]<queue[j][0])j++;if(queue[j][0]>=last[0])break;queue[i]=queue[j];i=j;}queue[i]=last;}return first;}
 while(queue.length){const [cost,node]=pop();if(cost!==costs.get(node))continue;if(node===end)break;for(const e of adjacent.get(node)||[]){const next=cost+edgeCost(e,weighted);if(next<(costs.get(e.to)??Infinity)){costs.set(e.to,next);previous.set(e.to,e);push([next,e.to]);}}}
 if(!costs.has(end))fail(422,'No connected walking route was found. Try closer endpoints or a different area.');
 const segments=[];let node=end;while(node!==start){const e=previous.get(node);if(!e)fail(422,'Unable to reconstruct this route.');segments.unshift(e);node=e.from;}
 const length=segments.reduce((s,e)=>s+e.length,0);return {coordinates:[graph.nodes[start],...segments.map(e=>graph.nodes[e.to])],distance:Math.round(length),minutes:Math.max(1,Math.ceil(length/75)),cost:Math.round(segments.reduce((s,e)=>s+edgeCost(e,true),0)),lit_percent:length?Math.round(segments.filter(e=>e.lit==='yes').reduce((s,e)=>s+e.length,0)/length*100):0,unknown_percent:length?Math.round(segments.filter(e=>e.lit==='unknown').reduce((s,e)=>s+e.length,0)/length*100):0,segments};
}
export const demoPlaces=[{id:'0',name:'Cedar station'},{id:'15',name:'Library square'},{id:'3',name:'Market corner'},{id:'12',name:'Garden gate'}];
export function demoGraph(){const nodes={},edges=[];for(let y=0;y<4;y++)for(let x=0;x<4;x++)nodes[String(y*4+x)]=[12.975-y*.0015,77.59+x*.0016];
 for(let y=0;y<4;y++)for(let x=0;x<4;x++){const from=String(y*4+x);for(const [dx,dy] of [[1,0],[0,1]]){if(x+dx>3||y+dy>3)continue;const to=String((y+dy)*4+x+dx),outer=(dy===1&&x===0)||(dx===1&&y===3),lit=outer?'yes':(x+y)%3===0?'no':'unknown',activity=outer?1:.1;const length=distance(nodes[from],nodes[to]);const e={from,to,length,lit,activity,name:outer?'Market promenade':y===1?'Garden lane':'Cedar street'};edges.push(e,{...e,from:to,to:from});}}
 return {nodes,edges};}
const cache=new Map();
export function graphFromOSM(elements){
 const nodes={},edges=[];const points=elements.filter(e=>e.type==='node'&&e.tags&&(e.tags.shop||['cafe','restaurant','bus_station','library','hospital','pharmacy'].includes(e.tags.amenity)||e.tags.public_transport==='platform'));
 const allNodes=new Map(elements.filter(e=>e.type==='node').map(n=>[n.id,[n.lat,n.lon]]));
 for(const way of elements.filter(e=>e.type==='way'&&e.nodes&&e.tags?.highway)){
  const t=way.tags;if(['motorway','motorway_link','trunk','trunk_link','construction','proposed'].includes(t.highway)||['no','private'].includes(t.foot)||(['no','private'].includes(t.access)&&!['yes','designated','permissive'].includes(t.foot)))continue;
  if(t.highway==='cycleway'&&!['yes','designated','permissive'].includes(t.foot))continue;
  for(let i=1;i<way.nodes.length;i++){const a=allNodes.get(way.nodes[i-1]),b=allNodes.get(way.nodes[i]);if(!a||!b)continue;const from=String(way.nodes[i-1]),to=String(way.nodes[i]);nodes[from]=a;nodes[to]=b;const midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2],activity=Math.min(1,points.filter(p=>distance(midpoint,[p.lat,p.lon])<=75).length/3);const e={from,to,length:distance(a,b),lit:lighting(t.lit),activity,name:t.name||t.highway};if(t['oneway:foot']!=='-1')edges.push(e);if(t['oneway:foot']!=='yes')edges.push({...e,from:to,to:from});if(edges.length>12000)fail(422,'This area is too dense for the prototype. Choose closer endpoints.');}
 }
 return {nodes,edges};
}
async function liveGraph(origin,destination){
 if(distance(origin,destination)>3000)fail(422,'Live journeys are limited to endpoints within 3 km.');
 const south=Math.min(origin[0],destination[0])-.003,north=Math.max(origin[0],destination[0])+.003,west=Math.min(origin[1],destination[1])-.003,east=Math.max(origin[1],destination[1])+.003;
 const bounds=[south,west,north,east].map(v=>Number(v.toFixed(4))).join(',');const hit=cache.get(bounds);if(hit&&Date.now()-hit.time<3600000)return hit.graph;
 const q=`[out:json][timeout:15];(way[highway](${bounds});node[shop](${bounds});node[amenity~"cafe|restaurant|bus_station|library|hospital|pharmacy"](${bounds});node[public_transport=platform](${bounds}););out body;>;out skel qt;`;
 let elements;try{const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'RESQ-X-prototype/0.1'},body:new URLSearchParams({data:q}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error();let size=0;const chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>8000000)throw new Error();chunks.push(Buffer.from(chunk));}const response=JSON.parse(Buffer.concat(chunks).toString());if(response.remark||!Array.isArray(response.elements)||response.elements.length>25000)throw new Error();elements=response.elements;}catch{fail(503,'Live map data is unavailable. Try again later or select the labeled offline demo.');}
 const graph=graphFromOSM(elements);if(!Object.keys(graph.nodes).length)fail(422,'No walkable streets were found in this area.');if(cache.size>=10)cache.delete(cache.keys().next().value);cache.set(bounds,{time:Date.now(),graph});return graph;
}
function coordinates(value){if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite)||Math.abs(value[0])>85||Math.abs(value[1])>179.9)fail(422,'Enter valid latitude and longitude coordinates.');return value;}
export async function routeRequest(data){
 let graph,start,end,mode=data.mode;
 if(mode==='demo'){graph=demoGraph();start=String(data.origin);end=String(data.destination);if(!demoPlaces.some(p=>p.id===start)||!demoPlaces.some(p=>p.id===end))fail(422,'Select sample locations.');}
 else if(mode==='live'){const a=coordinates(data.origin),b=coordinates(data.destination);graph=await liveGraph(a,b);const nearest=point=>Object.keys(graph.nodes).reduce((best,id)=>distance(point,graph.nodes[id])<distance(point,graph.nodes[best])?id:best);start=nearest(a);end=nearest(b);if(distance(a,graph.nodes[start])>250||distance(b,graph.nodes[end])>250)fail(422,'A selected location is more than 250 m from the available walking network.');}
 else fail(422,'Choose live or demo routing.');
 if(start===end)fail(422,'Choose different start and destination points.');
 return {mode,shortest:shortestPath(graph,start,end,false),weighted:shortestPath(graph,start,end,true),network:graph,attribution:mode==='demo'?'Fictional sample network — not for navigation':'© OpenStreetMap contributors',explanation:'Cost = metres × [1 + 2.5 × (1 − lighting) + 1.5 × (1 − activity)]. Unknown lighting = 0.5. Activity = selected amenities within 75 m, capped at 3. Tags are not live conditions.'};
}
