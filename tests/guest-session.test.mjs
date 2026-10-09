import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApkSession} from '../electron/apk-session.mjs';
import {createAccount} from '../electron/account.mjs';

const response=()=>new Response('{"device_id":9007199254740993123,"install_id":9007199254740993456}');
const adapter={call:async()=>({body:Buffer.from('synthetic').toString('base64')}),close(){}};
test('Memory-only Mac guest never reads or writes OS encrypted storage and preserves int64',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'hg-memory-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const profile=path.join(folder,'guest.bin');await fs.writeFile(profile,'old encrypted sentinel');let encryptions=0,decryptions=0,requests=0;
 const session=createApkSession({profile,resources:'unused',persistent:false,adapter,encode:()=>{encryptions++;throw new Error('locked');},decode:()=>{decryptions++;throw new Error('locked');},fetcher:async()=>{requests++;return response();}});t.after(session.close);
 const [first,second]=await Promise.all([session.prepare(),session.prepare()]);assert.equal(first,second);assert.equal(first.device_id,'9007199254740993123');assert.equal(first.iid,'9007199254740993456');assert.equal(encryptions,0);assert.equal(decryptions,0);assert.equal(requests,1);assert.equal(await fs.readFile(profile,'utf8'),'old encrypted sentinel');
});
test('Failed secure persistence keeps the successful guest in memory, without plaintext fallback',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'hg-locked-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const profile=path.join(folder,'guest.bin');let requests=0;
 const session=createApkSession({profile,resources:'unused',adapter,encode:()=>{throw new Error('denied');},fetcher:async()=>{requests++;return response();}});t.after(session.close);
 const first=await session.prepare();assert.equal(await session.prepare(),first);assert.equal(requests,1);await assert.rejects(fs.access(profile));await assert.rejects(fs.access(profile+'.tmp'));
});
test('Zero-ID retries reuse registration payload, remain bounded and never invent identity',async t=>{
 const payloads=[];let calls=0;const session=createApkSession({resources:'unused',persistent:false,adapter,retryDelay:async()=>{},fetcher:async(_url,options)=>{payloads.push(options.body.toString('hex'));return ++calls<3?new Response('{"device_id":0,"install_id":0}'):response();}});t.after(session.close);
 assert.equal((await session.prepare()).iid,'9007199254740993456');assert.equal(calls,3);assert.equal(new Set(payloads).size,1);
 let invalid=0;const failed=createApkSession({resources:'unused',persistent:false,adapter,retryDelay:async()=>{},fetcher:async()=>{invalid++;return new Response('{"device_id":0,"install_id":0}');}});t.after(failed.close);await assert.rejects(failed.prepare(),/有效游客编号/);assert.equal(invalid,3);
});
test('Mac account startup does not decrypt stored credentials and does not delete them',async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'hg-no-autologin-'));t.after(()=>fs.rm(folder,{recursive:true,force:true}));const file=path.join(folder,'account-v1.bin');await fs.writeFile(file,'encrypted sentinel');let decrypted=0;
 const account=createAccount({folder,autoLoad:false,encode:()=>{throw new Error('unused');},decode:()=>{decrypted++;throw new Error('locked');}});
 assert.equal((await account.init()).loggedIn,false);assert.equal(decrypted,0);assert.equal(await fs.readFile(file,'utf8'),'encrypted sentinel');
});
