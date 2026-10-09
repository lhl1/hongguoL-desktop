import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPassportFetch,splitSetCookies,responseCookies} from '../electron/passport-transport.mjs';
test('merged cookies split correctly when CSRF is first and Expires contains a comma',()=>{
 const merged='passport_csrf_token=synthetic-csrf; Expires=Thu, 01 Jan 2037 00:00:00 GMT; Secure, sessionid=synthetic-session; HttpOnly; Secure, uid_tt=synthetic-id; Secure';
 assert.equal(splitSetCookies(merged).length,3);assert.match(splitSetCookies(merged)[0],/Expires=Thu, 01 Jan/);
 assert.equal(responseCookies({getSetCookie:()=>[merged]}).length,3);assert.equal(responseCookies({getSetCookie:()=>[],get:()=>merged}).length,3);
});
test('raw passport transport preserves cookies, token and manual auth header; rejects other hosts',async()=>{
 let options,headers={};const net={request:value=>{options=value;const req=new EventEmitter();req.setHeader=(k,v)=>headers[k]=v;req.abort=()=>{};req.write=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.rawHeaders=['Set-Cookie','passport_csrf_token=synthetic-csrf; Secure','Set-Cookie','sessionid=synthetic-session; Secure','X-Tt-Token','synthetic-token'];req.emit('response',res);res.emit('data',Buffer.from('{"message":"success"}'));res.emit('end');});return req;}};
 const fetch=createPassportFetch(net);await assert.rejects(fetch('https://example.com/passport/mobile/sms_login/'),/接口地址/);
 const res=await fetch('https://security.snssdk.com/passport/mobile/sms_login/',{method:'POST',headers:{Cookie:'sessionid=synthetic-session'},body:'synthetic=1'});assert.equal(options.redirect,'error');assert.equal(options.useSessionCookies,false);assert.equal(headers.Cookie,'sessionid=synthetic-session');assert.equal(responseCookies(res.headers).length,2);assert.equal(res.headers.get('x-tt-token'),'synthetic-token');assert.equal((await res.json()).message,'success');
});
test('passport cancellation aborts the owned request and never resolves as a login',async()=>{
 let aborted=false;const fetch=createPassportFetch({request:()=>Object.assign(new EventEmitter(),{abort:()=>aborted=true,setHeader(){},end(){}})});const controller=new AbortController();controller.abort();await assert.rejects(fetch('https://security.snssdk.com/passport/account/info/v2/',{signal:controller.signal}),/取消/);assert.equal(aborted,true);
});
