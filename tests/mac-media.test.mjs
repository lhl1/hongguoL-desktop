import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createMacMediaTransport,macMediaPermission} from '../electron/mac-media-transport.mjs';
import {createMediaBroker} from '../electron/apk-media.mjs';
import {decoderFailure} from '../electron/media-diagnostics.mjs';
const token='a'.repeat(48);
test('Decoder observation preserves the initial MP4 header and every following byte',async()=>{
 const first=Buffer.from('000000186674797069736f6d','hex'),second=Buffer.from('moov-and-fragments');
 const spawnProcess=()=>{const job=new EventEmitter();job.stdin=new PassThrough();job.stderr=new PassThrough();job.stdout=new PassThrough();job.kill=()=>{};setImmediate(()=>{job.stdout.write(first);job.stdout.end(second);setImmediate(()=>job.emit('close',0,null));});return job;};
 const broker=createMediaBroker('unused',{baseURL:'http://127.0.0.1:45678',spawnProcess});try{const p=broker.create({data:{video_model:JSON.stringify({video_duration:30,video_list:[{main_url:'https://v1.qznovelvod.com/test.mp4',video_meta:{codec_type:'h264',vtype:'mp4',vheight:720}}]})}},{id:'123456789',cover:'',episodeList:[{number:1,videoId:'987654321'}]},1);const response=await broker.stream(p.url.split('/').at(-1));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.concat([first,second]));}finally{broker.close();}
});
test('Only the exact application origin may receive loopback permission, never LAN or a foreign frame',()=>{assert.equal(macMediaPermission('loopback-network','app://desktop',true),true);assert.equal(macMediaPermission('loopback-network','app://desktop/index.html',true),true);for(const permission of ['local-network','local-network-access','media','unknown'])assert.equal(macMediaPermission(permission,'app://desktop',true),false);assert.equal(macMediaPermission('loopback-network','app://desktop.evil',true),false);assert.equal(macMediaPermission('loopback-network','https://desktop',true),false);assert.equal(macMediaPermission('loopback-network','app://desktop',false),false);});
test('Mac HTTP media stays on loopback, refuses foreign Host/origin/method/path and keeps local capability',async()=>{
 let calls=0;const transport=await createMacMediaTransport({stream:async key=>{calls++;return key===token?new Response(Uint8Array.of(1,2,3),{headers:{'Content-Type':'video/mp4'}}):new Response('',{status:410});}});
 try{const url=transport.baseURL+'/media/'+token;assert.match(transport.baseURL,/^http:\/\/127\.0\.0\.1:\d+$/);const response=await fetch(url);assert.equal(response.status,200);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await fetch(url,{headers:{Origin:'https://example.com'}})).status,403);assert.equal((await fetch(url,{method:'POST'})).status,403);assert.equal((await fetch(transport.baseURL+'/etc/passwd')).status,403);assert.equal((await fetch(url+'?key=x')).status,403);const hostStatus=await new Promise(resolve=>{http.get(url,{headers:{Host:'example.com'}},r=>{r.resume();resolve(r.statusCode);});});assert.equal(hostStatus,403);assert.equal(calls,1);}finally{transport.close();}
});
test('Disconnected Mac video aborts only its decoder signal',async()=>{
 let aborted;const stopped=new Promise(resolve=>{aborted=resolve;});const transport=await createMacMediaTransport({stream:async(_key,signal)=>{signal.addEventListener('abort',()=>aborted(true),{once:true});return new Response(new ReadableStream({start(c){c.enqueue(Uint8Array.of(1));}}));}});
 try{await new Promise(resolve=>{const request=http.get(transport.baseURL+'/media/'+token,r=>{r.once('data',()=>{request.destroy();resolve();});});});assert.equal(await Promise.race([stopped,new Promise(resolve=>setTimeout(()=>resolve(false),1000))]),true);}finally{transport.close();}
});
test('Mac local HTTP capabilities release, reject another origin and never expose key or CDN URL',async()=>{
 const broker=createMediaBroker('unused',{baseURL:'http://127.0.0.1:45678'});const result=broker.create({data:{video_model:JSON.stringify({video_duration:30,video_list:[{main_url:'https://v1.qznovelvod.com/test.mp4',video_meta:{codec_type:'h264',vtype:'mp4',vheight:720}}]})}},{id:'123456789',cover:'',episodeList:[{number:1,videoId:'987654321'}]},1);assert.match(result.url,/^http:\/\/127\.0\.0\.1:45678\/media\/[a-f0-9]{48}$/);assert.ok(!JSON.stringify(result).includes('qznovelvod'));assert.throws(()=>broker.release(result.url.replace('45678','45679')));assert.throws(()=>broker.release(result.url+'?x=1'));broker.release(result.url);assert.equal((await broker.stream(result.url.split('/').at(-1))).status,410);broker.close();
});
test('Decoder errors only produce fixed categories, never raw addresses, keys or account strings',()=>{
 for(const [input,code] of [['Permission denied https://secret.example/?token=xyz','M101'],['TLS error account=123 secret=abcdef','M102'],['Unknown encoder libx264','M103'],['decryption key 00112233445566778899aabbccddeeff failed','M104'],['Protocol not found','M105'],['random user=123','M199']])assert.equal(decoderFailure(input),code);assert.equal(decoderFailure('','ENOENT'),'M101');assert.equal(decoderFailure('','','SIGKILL'),'M101');
});
