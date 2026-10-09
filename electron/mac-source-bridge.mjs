import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {safeMedia} from './apk-models.mjs';
import {UA} from './apk-rpc.mjs';

// FFmpeg reads a seekable local capability. Chromium alone handles remote HTTPS.
// No source addresses, cookies or decryption keys are returned to the renderer.
export function sourceFailure(error) {
 const text=String(error?.message||'');
 if(/cert|ssl|tls/i.test(text))return 'tls';
 if(/resolve|name_not_resolved|enotfound|dns/i.test(text))return 'dns';
 if(/timeout|timed out/i.test(text)||error?.name==='TimeoutError')return 'timeout';
 if(/abort/i.test(text)||error?.name==='AbortError')return 'cancelled';
 return 'connection';
}
export async function createMacSourceBridge({fetcher,onDiagnostic=()=>{}}) {
 if(typeof fetcher!=='function')throw new Error('Source fetcher required');
 const entries=new Map(),sockets=new Set();let port,closed=false;
 const report=value=>onDiagnostic({...value});
 const server=http.createServer(async(req,res)=>{
  const match=/^\/source\/([a-f0-9]{48})$/.exec(req.url||'');
  if(req.headers.host!==`127.0.0.1:${port}`||!match||req.method!=='GET'||req.headers.origin||req.headers.cookie||req.headers.authorization){res.writeHead(403);res.end();return;}
  const entry=entries.get(match[1]);
  if(!entry){res.writeHead(410);res.end();return;}
  const range=req.headers.range;
  if(range!==undefined&&(typeof range!=='string'||!/^bytes=\d{1,16}-\d{0,16}$/.test(range))){res.writeHead(416);res.end();return;}
  if(entry.controllers.size>=4){res.writeHead(429);res.end();return;}
  const controller=new AbortController();entry.controllers.add(controller);
  let upstream,reader,bytes=0,finished=false;
  const cancel=()=>{if(!finished)controller.abort();};res.on('close',cancel);
  const timeout=setTimeout(()=>controller.abort(new DOMException('Source timeout','TimeoutError')),20000);
  const fail=(status,failure)=>{report({phase:'failed',status,failure,bytes,range:!!range});if(!res.headersSent){res.writeHead(status>=400&&status<=599?status:502,{'Cache-Control':'no-store'});res.end();}else res.destroy();};
  try {
   let url=entry.url;
   report({phase:'connect',range:!!range});
   for(let redirects=0;redirects<=4;redirects++){
    upstream=await fetcher(safeMedia(url),{method:'GET',headers:{'User-Agent':UA,'Accept-Encoding':'identity',...(range?{Range:range}:{})},credentials:'omit',redirect:'manual',signal:controller.signal});
    if(![301,302,303,307,308].includes(upstream.status))break;
    const location=upstream.headers.get('location');await upstream.body?.cancel();
    if(!location||redirects===4){fail(502,'redirect');return;}
    try{url=safeMedia(new URL(location,url).href);}catch{fail(502,'redirect');return;}
   }
   clearTimeout(timeout);
   if(![200,206].includes(upstream.status)){await upstream.body?.cancel();fail(upstream.status,'http');return;}
   if(!upstream.body){fail(502,'format');return;}
   const contentRange=upstream.headers.get('content-range'),length=upstream.headers.get('content-length');
   if(upstream.status===206&&(!range||!/^bytes \d+-\d+\/\d+$/.test(contentRange||''))){await upstream.body.cancel();fail(502,'format');return;}
   const headers={'Content-Type':'video/mp4','Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
   if(contentRange&&/^bytes \d+-\d+\/\d+$/.test(contentRange))headers['Content-Range']=contentRange;
   if(length&&/^\d+$/.test(length)&&!upstream.headers.get('content-encoding'))headers['Content-Length']=length;
   report({phase:'response',status:upstream.status,range:!!range});
   res.writeHead(upstream.status,headers);
   res.setTimeout(30000,()=>controller.abort(new DOMException('Source idle timeout','TimeoutError')));
   reader=Readable.fromWeb(upstream.body);
   reader.on('data',chunk=>{bytes+=chunk.length;});
   await new Promise((resolve,reject)=>{
    reader.once('error',reject);res.once('error',reject);res.once('finish',resolve);res.once('close',()=>{if(!res.writableFinished)reject(new DOMException('Source cancelled','AbortError'));});
    reader.pipe(res);
   });
   finished=true;report({phase:'ended',status:upstream.status,bytes,range:!!range});
  }catch(error){const failure=controller.signal.aborted?sourceFailure(controller.signal.reason):sourceFailure(error);fail(502,failure);}
  finally{clearTimeout(timeout);entry.controllers.delete(controller);res.off('close',cancel);reader?.destroy();controller.abort();}
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 server.maxConnections=12;server.headersTimeout=10000;server.requestTimeout=30000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);port=server.address().port;resolve();});});
 function release(token){const entry=entries.get(token);entries.delete(token);if(entry)for(const controller of entry.controllers)controller.abort();}
 return {
  open(url){if(closed||entries.size>=8)throw new Error('Local source unavailable');const token=randomBytes(24).toString('hex');entries.set(token,{url:safeMedia(url),controllers:new Set()});return {url:`http://127.0.0.1:${port}/source/${token}`,close:()=>release(token)};},
  status:()=>({activeSources:entries.size,activeRequests:[...entries.values()].reduce((n,e)=>n+e.controllers.size,0)}),
  close(){closed=true;for(const token of entries.keys())release(token);server.close();for(const socket of sockets)socket.destroy();sockets.clear();}
 };
}
