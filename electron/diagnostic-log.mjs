import fs from 'node:fs';
import path from 'node:path';

const channels=new Set(['catalog:home','catalog:search','catalog:suggest','catalog:family','catalog:seriesGroups','catalog:filterCatalog','catalog:actorWorks','catalog:detail','catalog:playback','catalog:feed','catalog:rankings','media:release','media:diagnostics','window:control','library:read','library:favorite','library:progress','library:clearHistory','preferences:read','preferences:update','account:info','account:sendCode','account:login','account:sync','account:logout','app:status','diagnostics:export']);
const enums={transport:['app-protocol','loopback-http'],phase:['decoder-start','decoder-exec-failed','decoder-ended','cancelled','decoder-timeout','stream-start'],signal:['SIGKILL','SIGTERM','SIGABRT','SIGSEGV','SIGILL','SIGBUS'],event:['loadeddata','playing','waiting','stalled','error','ended','seek'],mode:['normal','window'],reason:['clean-exit','abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure']};
const number=(v,max=1e10)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=max?Math.round(v*100)/100:undefined;
const choice=(v,list)=>list.includes(v)?v:undefined;
function fields(kind,v={}){
 if(!v||typeof v!=='object'||Array.isArray(v))v={};
 let result;
 if(kind==='ipc')result={channel:choice(v.channel,[...channels]),ok:typeof v.ok==='boolean'?v.ok:undefined,ms:number(v.ms,3600000)};
 else if(kind==='decoder')result={transport:choice(v.transport,enums.transport),phase:choice(v.phase,enums.phase),code:/^M\d{3}$/.test(v.code)?v.code:undefined,bytes:number(v.bytes),exit:number(v.exit,255),signal:choice(v.signal,enums.signal)};
 else if(kind==='source')result={phase:choice(v.phase,['connect','response','ended','failed']),failure:choice(v.failure,['tls','dns','timeout','cancelled','connection','http','redirect','format']),status:number(v.status,599),bytes:number(v.bytes),range:typeof v.range==='boolean'?v.range:undefined};
 else if(kind==='guest')result={phase:choice(v.phase,['registration','storage']),outcome:choice(v.outcome,['http','invalid-id','ready','memory-only']),status:number(v.status,599),attempt:number(v.attempt,3)};
 else if(kind==='video')result={event:choice(v.event,enums.event),error:number(v.error,4),ready:number(v.ready,4),network:number(v.network,3),width:number(v.width,16384),height:number(v.height,16384),seconds:number(v.seconds,7200)};
 else if(kind==='window')result={mode:choice(v.mode,enums.mode),fullscreen:typeof v.fullscreen==='boolean'?v.fullscreen:undefined,maximized:typeof v.maximized==='boolean'?v.maximized:undefined};
 else if(kind==='renderer')result={reason:choice(v.reason,enums.reason),exit:number(v.exit,255)};
 else if(kind==='lifecycle')result={event:choice(v.event,['start','ready','quit','unresponsive','responsive','export','export-failed']),code:choice(v.code,['WRITE_FAILED'])};
 else return undefined;
 return Object.fromEntries(Object.entries(result).filter(([,value])=>value!==undefined));
}
export function safeLogEvent(kind,value,at=Date.now()){
 const data=fields(kind,value);if(!data||!Object.keys(data).length)return undefined;
 return {at:typeof at==='number'&&Number.isFinite(at)&&at>0&&at<=Date.now()+60000?Math.floor(at):Date.now(),kind,...data};
}
export function createDiagnosticLog(folder,{limit=400,metadata={}}={}){
 const file=path.join(folder,'diagnostic-log-v1.json');let events=[],timer,writeFailures=0;
 // Only explicit, non-identifying runtime fields are exported. Never spread external objects.
 const runtime={};
 for(const key of ['version','electron','chrome','node','osRelease'])if(typeof metadata[key]==='string'&&/^[\dA-Za-z.+-]{1,48}$/.test(metadata[key]))runtime[key]=metadata[key];
 runtime.platform=choice(metadata.platform,['win32','darwin','linux']);runtime.arch=choice(metadata.arch,['arm64','x64','ia32']);
 try{const previous=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(previous.events))events=previous.events.slice(-limit).map(e=>safeLogEvent(e.kind,e,e.at)).filter(Boolean);}catch{}
 function snapshot(){return{format:'hongguo-diagnostic-log-v1',exportedAt:new Date().toISOString(),runtime,persistenceWriteFailures:writeFailures,events:events.map(e=>({...e}))};}
 function flush(){clearTimeout(timer);timer=undefined;try{fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(snapshot()));fs.renameSync(file+'.tmp',file);}catch{writeFailures++;}}
 function record(kind,value){const entry=safeLogEvent(kind,value);if(!entry)return;events.push(entry);if(events.length>limit)events.splice(0,events.length-limit);if(!timer){timer=setTimeout(flush,1000);timer.unref();}}
 async function exportTo(filePath){record('lifecycle',{event:'export'});flush();await fs.promises.writeFile(filePath,JSON.stringify(snapshot(),null,2)+'\n','utf8');return{canceled:false,filename:path.basename(filePath)};}
 return{record,snapshot,flush,exportTo};
}
