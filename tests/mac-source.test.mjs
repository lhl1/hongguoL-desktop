import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createMacSourceBridge} from '../electron/mac-source-bridge.mjs';
import {createMediaBroker} from '../electron/apk-media.mjs';
import {safeLogEvent} from '../electron/diagnostic-log.mjs';

test('Mac source bridge preserves Range and MP4 bytes and forwards no credentials',async()=>{
 const calls=[],events=[];
 const bridge=await createMacSourceBridge({onDiagnostic:v=>events.push(v),fetcher:async(url,options)=>{calls.push({url,options});return new Response(Uint8Array.of(4,5,6),{status:206,headers:{'Content-Range':'bytes 3-5/6','Content-Length':'3'}});}});
 try{
  const source=bridge.open('https://v1.qznovelvod.com/test.mp4?secret=SENTINEL');
  const response=await fetch(source.url,{headers:{Range:'bytes=3-5'}});
  assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 3-5/6');assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[4,5,6]);
  assert.equal(calls[0].options.headers.Range,'bytes=3-5');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.headers.Cookie,undefined);
  assert.ok(!source.url.includes('SENTINEL'));assert.ok(!JSON.stringify(events).includes('SENTINEL'));
  for(const headers of [{Origin:'app://desktop'},{Cookie:'secret'},{Authorization:'secret'},{Range:'bytes=0-1,3-4'}])assert.ok([403,416].includes((await fetch(source.url,{headers})).status));
  assert.equal((await fetch(source.url+'?x=1')).status,403);
  const badHost=await new Promise(resolve=>{http.get(source.url,{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);});});assert.equal(badHost,403);
  source.close();assert.equal((await fetch(source.url)).status,410);assert.equal(bridge.status().activeSources,0);
 }finally{bridge.close();}
});
test('Mac source redirects cannot become SSRF, HTTP or credential leaks',async()=>{
 for(const target of ['http://v1.qznovelvod.com/test','https://example.com/test','http://127.0.0.1:123/test','https://user:pass@v1.qznovelvod.com/test']){
  let calls=0;const bridge=await createMacSourceBridge({fetcher:async()=>{calls++;return new Response('',{status:302,headers:{Location:target}});}});
  try{const source=bridge.open('https://v1.qznovelvod.com/test');assert.equal((await fetch(source.url)).status,502);assert.equal(calls,1);}finally{bridge.close();}
 }
 let calls=0;const bridge=await createMacSourceBridge({fetcher:async()=>++calls===1?new Response('',{status:302,headers:{Location:'https://v2.bytevod.com/allowed'}}):new Response(Uint8Array.of(9))});
 try{assert.deepEqual([...new Uint8Array(await(await fetch(bridge.open('https://v1.qznovelvod.com/test').url)).arrayBuffer())],[9]);assert.equal(calls,2);}finally{bridge.close();}
});
test('Mac source rejects invalid partial replies, classifies failures and cancels upstream on release',async()=>{
 const events=[];const bridge=await createMacSourceBridge({onDiagnostic:v=>events.push(v),fetcher:async()=>{throw new Error('ERR_CERT_AUTHORITY_INVALID https://secret/?key=SENTINEL');}});
 try{assert.equal((await fetch(bridge.open('https://v1.qznovelvod.com/test').url)).status,502);assert.equal(events.at(-1).failure,'tls');assert.ok(!JSON.stringify(events).includes('SENTINEL'));}finally{bridge.close();}
 const malformed=await createMacSourceBridge({fetcher:async()=>new Response(Uint8Array.of(1),{status:206})});
 try{assert.equal((await fetch(malformed.open('https://v1.qznovelvod.com/test').url,{headers:{Range:'bytes=0-'}})).status,502);}finally{malformed.close();}
 let aborted=false,started;const ready=new Promise(r=>started=r);
 const pending=await createMacSourceBridge({fetcher:async(_url,{signal})=>{started();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));}});
 try{const source=pending.open('https://v1.qznovelvod.com/test');const request=fetch(source.url);await ready;source.close();assert.equal((await request).status,502);assert.equal(aborted,true);}finally{pending.close();}
});
test('Decoder only sees local source and releases it on failure, without losing the first output bytes',async()=>{
 let args,stdin='',released=0;
 const spawnProcess=(_exe,argv)=>{args=argv;const job=new EventEmitter();job.stdin=new PassThrough();job.stdin.on('data',b=>stdin+=b);job.stderr=new PassThrough();job.stdout=new PassThrough();job.kill=()=>{};setImmediate(()=>{job.stdout.end(Buffer.from('ftyp-frame'));setImmediate(()=>job.emit('close',0));});return job;};
 const broker=createMediaBroker('unused',{baseURL:'http://127.0.0.1:45678',spawnProcess,openSource:()=>({url:'http://127.0.0.1:12345/source/'+ 'a'.repeat(48),close:()=>released++})});
 try{const p=broker.create({data:{video_model:JSON.stringify({video_duration:30,video_list:[{main_url:'https://v1.qznovelvod.com/private',video_meta:{codec_type:'h264',vtype:'mp4',vheight:720}}]})}},{id:'123456789',cover:'',episodeList:[{number:1,videoId:'987654321'}]},1);assert.equal(Buffer.from(await(await broker.stream(p.url.split('/').at(-1))).arrayBuffer()).toString(),'ftyp-frame');await new Promise(r=>setImmediate(r));assert.ok(stdin.includes('/source/'));assert.ok(!stdin.includes('qznovelvod'));assert.ok(!JSON.stringify(args).includes('private'));assert.equal(args[args.indexOf('-protocol_whitelist')+1],'pipe,http,tcp,crypto');assert.equal(released,1);}finally{broker.close();}
});
test('New log categories cannot expose addresses, credentials or arbitrary error messages',()=>{
 const secret='SENTINEL';for(const kind of ['source','guest']){const event=safeLogEvent(kind,{phase:kind==='guest'?'registration':'failed',outcome:'invalid-id',failure:'tls',status:403,bytes:0,attempt:2,url:secret,error:secret,device_id:secret,token:secret});assert.ok(event);assert.ok(!JSON.stringify(event).includes(secret));}
});
