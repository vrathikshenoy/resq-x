import {randomUUID} from 'node:crypto';
import {db} from './db.mjs';
import {fail,json,text} from './server.mjs';
export function contactFeatures({path,method,data,user,res}){
 if(path==='/api/v1/contacts'&&method==='GET'){json(res,200,db.prepare('SELECT id,name,phone,relation,verified FROM contacts WHERE user_id=? ORDER BY rowid').all(user.id));return true;}
 const match=path.match(/^\/api\/v1\/contacts\/([a-f0-9-]+)$/);
 if((path==='/api/v1/contacts'&&method==='POST')||(match&&method==='PUT')){
  const name=text(data.name,1,60),phone=text(data.phone,8,16),relation=text(data.relation,1,30);
  if(!/^\+[1-9]\d{7,14}$/.test(phone))fail(422,'Use international format, for example +919876543210.');
  if(match&&!db.prepare('SELECT id FROM contacts WHERE id=? AND user_id=?').get(match[1],user.id))fail(404,'Contact not found.');
  if(!match&&db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE user_id=?').get(user.id).n>=10)fail(422,'You can add up to 10 trusted contacts.');
  const duplicate=db.prepare('SELECT id FROM contacts WHERE phone=? AND user_id=?').get(phone,user.id);if(duplicate&&duplicate.id!==match?.[1])fail(409,'This phone number is already in your circle.');
  const id=match?.[1]||randomUUID();
  if(match)db.prepare('UPDATE contacts SET name=?,relation=?,verified=CASE WHEN phone=? THEN verified ELSE 0 END,phone=? WHERE id=? AND user_id=?').run(name,relation,phone,phone,id,user.id);
  else db.prepare('INSERT INTO contacts (id,user_id,name,phone,relation) VALUES (?,?,?,?,?)').run(id,user.id,name,phone,relation);
  json(res,match?200:201,{id,name,phone,relation,verified:db.prepare('SELECT verified FROM contacts WHERE id=?').get(id).verified});return true;
 }
 if(match&&['PATCH','DELETE'].includes(method)){
  if(!db.prepare('SELECT id FROM contacts WHERE id=? AND user_id=?').get(match[1],user.id))fail(404,'Contact not found.');
  if(method==='PATCH'){if(data.verify_simulation!==true)fail(422,'Explicitly confirm simulated verification.');db.prepare('UPDATE contacts SET verified=1 WHERE id=? AND user_id=?').run(match[1],user.id);json(res,200,{verified:true,simulation:true});}
  else{db.prepare('DELETE FROM contacts WHERE id=? AND user_id=?').run(match[1],user.id);json(res,200,{deleted:true});}return true;
 }
 if(path==='/api/v1/alerts'&&method==='GET'){json(res,200,db.prepare('SELECT * FROM alerts WHERE user_id=? ORDER BY created DESC LIMIT 50').all(user.id).map(({user_id,request_id,...a})=>({...a,recipients:JSON.parse(a.recipients)})));return true;}
 if(path==='/api/v1/alerts/trigger'&&method==='POST'){
  const requestId=text(data.request_id,8,80);if(!/^[a-zA-Z0-9-]+$/.test(requestId))fail(422,'Invalid request identifier.');
  if(!['manual','phrase','scream'].includes(data.type))fail(422,'Invalid alert type.');
  const old=db.prepare('SELECT * FROM alerts WHERE user_id=? AND request_id=?').get(user.id,requestId);
  if(old){json(res,200,{...old,user_id:undefined,request_id:undefined,recipients:JSON.parse(old.recipients),simulation:true});return true;}
  let latitude=null,longitude=null;
  if(data.location!==null&&data.location!==undefined){latitude=data.location.latitude;longitude=data.location.longitude;if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)fail(422,'Invalid location coordinates.');}
  const contacts=db.prepare('SELECT id,name FROM contacts WHERE user_id=? AND verified=1').all(user.id);if(!contacts.length)fail(409,'Add a contact and complete simulated verification before testing SOS.');
  const id=randomUUID(),created=new Date().toISOString();const recipients=contacts.map(c=>({contact_id:c.id,name:c.name,status:'simulated_delivered'}));
  db.prepare('INSERT INTO alerts VALUES (?,?,?,?,?,?,?,?,?)').run(id,user.id,requestId,data.type,created,latitude,longitude,'simulated_delivered',JSON.stringify(recipients));
  json(res,201,{id,type:data.type,created,latitude,longitude,status:'simulated_delivered',recipients,simulation:true});return true;
 }
 return false;
}
