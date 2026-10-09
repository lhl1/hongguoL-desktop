import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDiagnosticLog,safeLogEvent} from '../electron/diagnostic-log.mjs';

test('diagnostic export excludes raw secrets, arbitrary fields and prior-log injection',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-safe-log-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const secret='SENSITIVE_SENTINEL';fs.writeFileSync(path.join(folder,'diagnostic-log-v1.json'),JSON.stringify({events:[{kind:'ipc',channel:'catalog:playback',ok:false,at:Date.now(),key:secret,error:secret}]}));
 const log=createDiagnosticLog(folder,{metadata:{version:'0.6.0-apk.11',platform:'win32',arch:'x64',path:secret,user:secret}});t.after(log.flush);
 for(const kind of ['ipc','decoder','video','window','renderer','lifecycle'])log.record(kind,{channel:'catalog:search',ok:false,phase:'decoder-exec-failed',code:'M101',event:'error',error:4,mode:'normal',reason:'crashed',url:secret,password:secret,account:{token:secret},signal:secret});
 log.record('raw',secret);log.record('ipc',{channel:secret,ms:NaN});
 const target=path.join(folder,'export.log');assert.equal((await log.exportTo(target)).canceled,false);
 const text=fs.readFileSync(target,'utf8');assert.ok(!text.includes(secret));const output=JSON.parse(text);assert.equal(output.runtime.version,'0.6.0-apk.11');assert.ok(output.events.some(e=>e.code==='M101'));assert.ok(output.events.some(e=>e.error===4));assert.ok(!text.includes('password'));assert.equal(output.format,'hongguo-diagnostic-log-v1');
});
test('diagnostic ring persists bounded recent history and rejects failed output writes',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-ring-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));const log=createDiagnosticLog(folder,{limit:3});t.after(log.flush);
 for(let i=0;i<9;i++)log.record('ipc',{channel:'catalog:search',ok:true,ms:i});log.flush();const restored=createDiagnosticLog(folder,{limit:3});t.after(restored.flush);assert.deepEqual(restored.snapshot().events.map(e=>e.ms),[6,7,8]);await assert.rejects(restored.exportTo(path.join(folder,'missing','file.log')));
 assert.equal(safeLogEvent('ipc',{channel:'unknown'}),undefined);assert.equal(safeLogEvent('video',{event:'error',seconds:Infinity}).seconds,undefined);
});
