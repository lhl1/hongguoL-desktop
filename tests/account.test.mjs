import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createAccount, cloudHistory, xorAccount } from '../electron/account.mjs';
import { createStore } from '../electron/store.mjs';
import { stringifyAPKJSON, parseAPKJSON,isAccountAuthenticated } from '../electron/apk-rpc.mjs';
const uid='1234567890123456789', book='7689844778497739800', video='7689844778497739811';
const series={id:book,title:'协议测试',cover:'',episodes:80,tags:[]};
const sessionResult=()=>({data:parseAPKJSON('{"message":"success","data":{"user_id":1234567890123456789,"name":"测试用户"}}'),cookies:['sessionid=test-session; HttpOnly; Secure'],token:'test-token'});
function fixture(t, options={}) {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-account-contract-')), store=createStore(folder), key=randomBytes(32), nonce=randomBytes(12), calls=[];
  // Injected authenticated encryption exercises credential persistence; production uses Windows DPAPI.
  const encode=value=>{const cipher=createCipheriv('aes-256-gcm',key,nonce);return Buffer.concat([cipher.update(value),cipher.final(),cipher.getAuthTag()]);};
  const decode=value=>{const decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAuthTag(value.subarray(-16));return Buffer.concat([decipher.update(value.subarray(0,-16)),decipher.final()]).toString();};
  const config={folder,encode,decode,getStore:()=>store,detail:async()=>({episodeList:[{number:2,videoId:video}]}),request:async(op,fields)=>{calls.push({op,fields});return ['login','info'].includes(op)?sessionResult():{data:{message:'success',data:{retry_time:45}},cookies:[]};},reading:async(op,body)=>{calls.push({op,body});if(op==='userInfo')return{data:{user_id:uid}};if(op==='history')return{data:{data_list:[],has_more:false}};return{data:{update_fail_datas:[]}};},...options};
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  return{folder,store,calls,config,account:createAccount(config)};
}
test('invalid input cannot send SMS; guest cannot synchronize; send-code follows APK encoding and cooldown',async t=>{
  const {account,calls}=fixture(t);await assert.rejects(account.sendCode(''),/手机号/);await assert.rejects(account.login('13800138000','x'),/验证码/);await assert.rejects(account.sync(),/先登录/);assert.equal(calls.length,0);
  await account.sendCode('13800138000');assert.equal(calls[0].fields.mobile,xorAccount('+8613800138000'));assert.equal(calls[0].fields.type,xorAccount('24'));assert.equal(calls[0].fields.unbind_exist,xorAccount('1'));assert.equal(calls[0].fields.auto_read,'0');await assert.rejects(account.sendCode('13800138000'),/间隔/);assert.equal(calls.length,1);
});
test('login preserves 64-bit UID and encrypted session, survives restart, and logout removes credentials',async t=>{
  const {account,config,folder}=fixture(t);await account.login('13800138000','123456');assert.equal(account.info().user.userId,uid);
  const saved=fs.readFileSync(path.join(folder,'account-v1.bin'));assert.equal(saved.includes(Buffer.from('test-session')),false);assert.equal(saved.includes(Buffer.from('13800138000')),false);
  const restarted=createAccount(config);assert.equal((await restarted.init()).loggedIn,true);await restarted.logout();assert.equal(restarted.info().loggedIn,false);assert.equal(fs.existsSync(path.join(folder,'account-v1.bin')),false);
});
test('error code and safety challenge never become successful login',async t=>{
  const {account}=fixture(t,{request:async()=>({data:{message:'success',data:{error_code:1105,verify_ticket:'challenge'}},cookies:[],token:''})});
  await assert.rejects(account.login('13800138000','123456'),/安全验证/);assert.equal(account.info().loggedIn,false);
});
test('merged CSRF-first cookie response establishes the real server-issued session and persists it',async t=>{
 const {account,config}=fixture(t,{request:async()=>({data:{message:'success',data:{user_id:uid}},cookies:['passport_csrf_token=synthetic; Expires=Thu, 01 Jan 2037 00:00:00 GMT, sessionid=synthetic-session; HttpOnly'],token:''})});
 assert.equal((await account.login('13800138000','123456')).loggedIn,true);assert.equal((await createAccount(config).init()).loggedIn,true);
});
test('body session_key is accepted only after passport info confirms the same UID',async t=>{
 const calls=[];const {account,config}=fixture(t,{request:async op=>{calls.push(op);return{data:{message:'success',data:op==='login'?{user_id:uid,session_key:'synthetic-session-key-only'}:{user_id:uid}},cookies:[],token:''};}});
 assert.equal((await account.login('13800138000','123456')).loggedIn,true);assert.deepEqual(calls,['login','info']);assert.equal((await createAccount(config).init()).loggedIn,true);
 const bad=fixture(t,{request:async op=>({data:{message:'success',data:op==='login'?{user_id:uid,session_key:'synthetic-session-key-only'}:{user_id:'999999'}},cookies:[],token:''})}).account;await assert.rejects(bad.login('13800138000','123456'),/未能确认/);assert.equal(bad.info().loggedIn,false);
});
test('used code 1203 and missing session remain failed logins; error plus code zero cannot succeed',async t=>{
 for(const data of [{message:'error',data:{error_code:1203}},{message:'success',data:{user_id:uid}},{message:'error',code:0,data:{user_id:uid}}]){
  const {account}=fixture(t,{request:async()=>({data,cookies:[],token:''})});await assert.rejects(account.login('13800138000','123456'));assert.equal(account.info().loggedIn,false);
 }
});
test('rejected login rolls back partial authentication cookies and never marks subsequent requests logged in',async t=>{
 const {account}=fixture(t,{request:async()=>({data:{message:'error',data:{error_code:1203}},cookies:['sessionid=synthetic-rejected-session; Secure'],token:''})});
 await assert.rejects(account.login('13800138000','123456'),/重新获取/);assert.equal(account.info().loggedIn,false);assert.equal(isAccountAuthenticated(),false);
});
test('cloud sync uploads precise IDs and milliseconds, retains newer local progress, and imports newer remote records',async t=>{
  const second='7689844778497739820',calls=[];
  const {account,store}=fixture(t,{reading:async(op,body)=>{calls.push({op,body});if(op==='userInfo')return{data:{user_id:uid}};if(op==='history')return{data:{data_list:[{book_id_str:book,book_type:2,book_name:'旧进度',vid_index:1,current_play_position:1000,read_timestamp_ms:1},{book_id_str:second,book_type:2,book_name:'云端剧',vid_index:3,current_play_position:15250,read_timestamp_ms:Date.now()+1000}],has_more:false}};return{data:{update_fail_datas:[]}};}});
  store.progress({...series,episode:2,seconds:24});await account.login('13800138000','123456');const result=await account.sync();assert.equal(result.account.sync.state,'success');assert.equal(result.account.sync.uploaded,1);assert.equal(result.library.history.find(v=>v.id===book).seconds,24);assert.equal(result.library.history.find(v=>v.id===second).episode,3);
  const body=calls.find(v=>v.op==='historyUpdate').body;assert.equal(body.update_datas[0].current_play_position,24000);assert.match(stringifyAPKJSON(body),/"book_id":7689844778497739800/);assert.match(stringifyAPKJSON(body),/"vid":7689844778497739811/);
});
test('expired session prevents any history request or upload',async t=>{
  const calls=[],{account}=fixture(t,{reading:async op=>{calls.push(op);return{data:{user_id:'999999'}};}});await account.login('13800138000','123456');await assert.rejects(account.sync(),/账号信息格式/);assert.deepEqual(calls,['userInfo']);assert.equal(account.info().sync.state,'error');
});

test('APK encoded reading ID is bound only after Passport confirms the numeric account; token refresh persists encrypted',async t=>{
 const calls=[];let encoded='synthetic#reading/identity_encoded';
 const {account,config}=fixture(t,{request:async op=>{calls.push(op);const result=sessionResult();if(op==='info')result.token='synthetic-refreshed-token';return result;},reading:async op=>op==='userInfo'?{data:{user_id:encoded}}:{data:{data_list:[],has_more:false}}});
 await account.login('13800138000','123456');assert.equal((await account.sync()).account.sync.state,'success');assert.deepEqual(calls,['login','info']);
 const reloaded=createAccount(config);await reloaded.init();encoded='synthetic-other-account-encoded';await assert.rejects(reloaded.sync(),/不一致/);
});

test('Passport identity mismatch blocks all reading requests even if reading can return success',async t=>{
 const calls=[];const {account}=fixture(t,{request:async op=>op==='login'?sessionResult():{data:{message:'success',data:{user_id:'999999'}},cookies:[],token:''},reading:async op=>{calls.push(op);return{data:{user_id:'synthetic-encoded-id'}};}});
 await account.login('13800138000','123456');await assert.rejects(account.sync(),/已失效/);assert.deepEqual(calls,[]);
});

test('anonymous, empty, and malformed reading identities cannot read or upload cloud history',async t=>{
 for(const identity of ['',undefined,'0','<invalid-account>']){const calls=[],{account}=fixture(t,{reading:async op=>{calls.push(op);return{data:{user_id:identity}};}});await account.login('13800138000','123456');await assert.rejects(account.sync());assert.deepEqual(calls,['userInfo']);}
});

test('logout during Passport confirmation prevents subsequent history access',async t=>{
 let release;const calls=[];const {account}=fixture(t,{request:async op=>op==='login'?sessionResult():new Promise(resolve=>{release=()=>resolve(sessionResult());}),reading:async op=>{calls.push(op);return{data:{}};}});
 await account.login('13800138000','123456');const task=account.sync();await account.logout();release();await assert.rejects(task,/账号已改变/);assert.deepEqual(calls,[]);assert.equal(account.info().loggedIn,false);
});
test('server refusing updates leaves sync in error without importing remote history',async t=>{
  const {account,store}=fixture(t,{reading:async op=>op==='userInfo'?{data:{user_id:uid}}:op==='history'?{data:{data_list:[],has_more:false}}:{data:{update_fail_datas:[{book_id:book}]}}});store.progress({...series,episode:2,seconds:24});await account.login('13800138000','123456');await assert.rejects(account.sync(),/未被服务端接受/);assert.equal(account.info().sync.state,'error');
});
test('history parser excludes soft-deleted and non-video records and converts milliseconds',()=>{
  const raw={data:{data_list:[{book_id_str:book,book_type:2,book_name:'正常',vid_index:2,current_play_position:17500,read_timestamp_ms:100},{book_id_str:book,book_type:1,book_name:'小说'},{book_id_str:book,book_type:2,is_delete:true}],has_more:false}};
  const result=cloudHistory(raw);assert.equal(result.items.length,1);assert.equal(result.items[0].seconds,17.5);assert.equal(result.items[0].id,book);
});
