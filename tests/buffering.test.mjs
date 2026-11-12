import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {bufferProfile,createReadAhead} from '../electron/media-buffer.mjs';
import {bufferedAhead,canPrefetch,createPlaybackWatchdog,createRecoveryBudget} from '../src/playback-recovery.mjs';
import {createPreferences} from '../electron/preferences.mjs';
import {safeLogEvent} from '../electron/diagnostic-log.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('aggressive read-ahead consumes 32MiB before browser reads; standard mode applies smaller backpressure',async()=>{
 for(const aggressive of [true,false]){const profile=bufferProfile(aggressive),{output,body}=createReadAhead(profile);const source=new PassThrough({highWaterMark:65536});source.pipe(output);let offered=0;for(let i=0;i<512;i++){offered+=65536;if(!source.write(Buffer.alloc(65536)))break;}await tick();if(aggressive)assert.equal(offered,32*1024*1024);else assert.ok(offered<=2*1024*1024);await body.cancel();source.destroy();}
});
test('aggressive read-ahead remains bounded above its watermarks and cancellation releases producer',async()=>{
 const profile=bufferProfile(),{output,body}=createReadAhead(profile);const source=new PassThrough({highWaterMark:65536});source.pipe(output);let accepted=0,drains=0;
 const pump=()=>{while(accepted<128*1024*1024){accepted+=65536;if(!source.write(Buffer.alloc(65536))){drains++;source.once('drain',pump);return;}}};pump();await tick();await tick();assert.ok(accepted<40*1024*1024);assert.ok(drains>0);assert.ok(output.readableLength<=profile.readable+65536);assert.ok(output.writableLength<=profile.writable+65536);await body.cancel();assert.ok(output.destroyed);source.destroy();
});
test('progressive read-ahead preserves every byte including first MP4 header',async()=>{const {output,body}=createReadAhead(bufferProfile());const expected=Buffer.concat([Buffer.from('ftypmoov'),Buffer.alloc(2*1024*1024,7)]);const response=new Response(body);output.end(expected);assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);});
test('prefetch prioritizes active buffer, accounts for speed and allows complete short episodes',()=>{
 const video=(time,ranges,rate=1)=>({currentTime:time,playbackRate:rate,readyState:3,error:null,buffered:{length:ranges.length,start:i=>ranges[i][0],end:i=>ranges[i][1]}});
 assert.equal(bufferedAhead(video(10,[[0,30],[40,50]])),20);assert.equal(bufferedAhead(video(35,[[0,30],[40,50]])),0);
 assert.equal(canPrefetch(video(10,[[0,40]],2),100,true),false);assert.equal(canPrefetch(video(10,[[0,51]],2),100,true),true);assert.equal(canPrefetch(video(10,[[0,18]],2),8,true),true);assert.equal(canPrefetch(video(10,[[0,18]]),100,false),true);
});
test('watchdog catches repeated small clock drift and eventless freeze but ignores normal progress, pause, held and ended',()=>{
 const w=createPlaybackWatchdog(),base={source:1,seconds:20,playing:true,held:false,ended:false,aggressive:true};assert.equal(w.observe(base,0),false);
 for(let i=1;i<=5;i++)assert.equal(w.observe({...base,seconds:20+i*.005},i*1000),false);assert.equal(w.observe({...base,seconds:20.03},6000),true);
 assert.equal(w.observe({...base,playing:false},20000),false);assert.equal(w.observe({...base,playing:false},90000),false);assert.equal(w.observe({...base,playing:true},91000),false);
 assert.equal(w.observe({...base,source:2},100000),false);assert.equal(w.observe({...base,held:true},120000),false);assert.equal(w.observe({...base,ended:true},150000),false);
 const normal=createPlaybackWatchdog();for(let i=0;i<100;i++)assert.equal(normal.observe({...base,seconds:i*.2},i*1000),false);
 const standard=createPlaybackWatchdog();assert.equal(standard.observe({...base,aggressive:false},0),false);assert.equal(standard.observe({...base,aggressive:false},6000),false);assert.equal(standard.observe({...base,aggressive:false},10000),true);
});
test('recovery budget needs actual sustained progress; absolute time or a seek cannot reset repeated failures',()=>{const b=createRecoveryBudget();assert.ok(b.take());b.progress(50);b.progress(50.25);assert.ok(b.take());b.progress(100);assert.equal(b.take(),false);b.reset();assert.ok(b.take());for(let i=0;i<=45;i++)b.progress(i*.25);assert.equal(b.count(),0);});
test('old settings gain aggressive buffering without resetting preferences; invalid values cannot persist',t=>{const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hg-buffer-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));fs.writeFileSync(path.join(folder,'preferences-v2.json'),JSON.stringify({theme:'dark',defaultSpeed:2,volume:.3}));const p=createPreferences(folder);assert.equal(p.read().aggressiveBuffer,true);assert.equal(p.read().defaultSpeed,2);p.update({aggressiveBuffer:false});assert.equal(createPreferences(folder).read().aggressiveBuffer,false);assert.equal(createPreferences(folder).read().theme,'dark');for(const value of ['true',1,null,{}])assert.throws(()=>p.update({aggressiveBuffer:value}));});
test('buffering diagnostics include only bounded numeric/enum fields, never arbitrary identifiers',()=>{const event=safeLogEvent('video',{event:'freeze',bufferAhead:.25,rate:2,role:'active',frames:123,dropped:2,url:'secret',account:'secret'});assert.equal(event.bufferAhead,.25);assert.equal(event.role,'active');assert.ok(!JSON.stringify(event).includes('secret'));const d=safeLogEvent('decoder',{phase:'stream-progress',bufferMode:'aggressive',bufferedBytes:1200,decodedSeconds:42,decoderSpeed:3.5,idleMs:1200,key:'secret'});assert.equal(d.decoderSpeed,3.5);assert.ok(!JSON.stringify(d).includes('secret'));});
