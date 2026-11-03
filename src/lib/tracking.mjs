export function summarizeDevice(observations,trusted=false){
 const sessions=new Set(observations.map(o=>o.session)),moved=new Set(observations.filter(o=>o.moved).map(o=>o.session));const first=observations[0],last=observations.at(-1);const change=first&&last?last.rssi-first.rssi:0;
 return {sessions:sessions.size,movedSessions:moved.size,persistent:!trusted&&sessions.size>=3&&moved.size>=2,trend:change>4?'Signal getting stronger':change< -4?'Signal getting weaker':'Signal broadly stable'};
}
export function approximateDistance(rssi,reference=-59,pathLoss=2){if(!Number.isFinite(rssi)||!Number.isFinite(reference)||!Number.isFinite(pathLoss)||pathLoss<1||pathLoss>6)throw new Error('Invalid calibration.');return 10**((reference-rssi)/(10*pathLoss));}
export function appendObservation(devices,observation){
 if(typeof observation.id!=='string'||typeof observation.name!=='string'||!Number.isFinite(observation.rssi)||observation.rssi>20||observation.rssi< -127)throw new Error('Invalid Bluetooth observation.');
 const found=devices.find(d=>d.id===observation.id);const item={id:observation.id,name:observation.name,observations:[...(found?.observations||[]),{rssi:observation.rssi,time:observation.time,session:observation.session,moved:!!observation.moved}].slice(-30)};
 return [...devices.filter(d=>d.id!==item.id),item].slice(-25);
}
