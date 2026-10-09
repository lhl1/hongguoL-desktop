import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createImageBroker } from '../electron/images.mjs';
test('local HEIC needing backward seeks converts to real PNG; concurrent loads share one request and cache',{skip:!process.env.HONGGUO_HEIC_FIXTURE||!fs.existsSync('native-resources/media/ffmpeg.exe')},async t=>{
  const input=fs.readFileSync(process.env.HONGGUO_HEIC_FIXTURE);let calls=0;
  const broker=createImageBroker(path.resolve('native-resources'),async()=>{calls++;return new Response(input,{headers:{'Content-Type':'image/heic'}});});t.after(()=>broker.close());
  const url='https://p3-reading-sign.fqnovelpic.com/fixture.heic',responses=await Promise.all([broker.handle(url),broker.handle(url)]);assert.equal(calls,1);
  for(const r of responses){assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const png=Buffer.from(await r.arrayBuffer());assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(png.readUInt32BE(16)>0);assert.ok(png.readUInt32BE(20)>0);}
  assert.equal((await broker.handle(url)).status,200);assert.equal(calls,1);assert.equal(broker.status().entries,1);
});
test('image broker rejects foreign hosts and non-images without putting them in cache',async t=>{
  let calls=0;const broker=createImageBroker('',async()=>{calls++;return new Response('<html>',{headers:{'Content-Type':'text/html'}});});t.after(()=>broker.close());
  assert.equal((await broker.handle('https://example.com/image')).status,403);assert.equal(calls,0);assert.equal((await broker.handle('https://p3-reading-sign.fqnovelpic.com/test')).status,502);assert.equal(broker.status().entries,0);
});
