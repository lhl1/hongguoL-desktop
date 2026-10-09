import http from 'node:http';
import {Readable} from 'node:stream';

// Mac Chromium receives a normal local HTTP MP4 stream instead of an app-scheme Response.
// No assets, remote URLs, credentials, or keys are served by this endpoint.
export async function createMacMediaTransport({stream}) {
 const sockets=new Set();let port;const audit={requests:0,rejectedHost:0,rejectedOrigin:0,rejectedPath:0,rejectedMethod:0,responses:{}};
 const server=http.createServer(async(req,res)=>{
  const token=/^\/media\/([a-f0-9]{48})$/.exec(req.url||'');
  audit.requests++;if(req.headers.host!==`127.0.0.1:${port}`)audit.rejectedHost++;if(!token)audit.rejectedPath++;if(req.method!=='GET')audit.rejectedMethod++;if(req.headers.origin&&req.headers.origin!=='app://desktop')audit.rejectedOrigin++;
  if(req.headers.host!==`127.0.0.1:${port}`||!token||req.method!=='GET'||(req.headers.origin&&req.headers.origin!=='app://desktop')){res.writeHead(403,{'Cache-Control':'no-store'});res.end();return;}
  const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  try {
   const response=await stream(token[1],controller.signal);
   audit.responses[response.status]=(audit.responses[response.status]||0)+1;
   if(res.destroyed){controller.abort();await response.body?.cancel();return;}
   res.writeHead(response.status,{'Content-Type':'video/mp4','Cache-Control':'no-store','Accept-Ranges':'none','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin','Access-Control-Allow-Origin':'app://desktop'});
   if(response.body){const body=Readable.fromWeb(response.body);body.on('error',()=>{controller.abort();res.destroy();});res.on('close',()=>body.destroy());body.pipe(res);}else res.end();
  }catch{controller.abort();if(!res.headersSent)res.writeHead(502);res.end();}
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 server.maxConnections=8;server.requestTimeout=30000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);port=server.address().port;resolve();});});
 return {baseURL:`http://127.0.0.1:${port}`,status:()=>structuredClone(audit),close:()=>{server.close();for(const socket of sockets)socket.destroy();sockets.clear();}};
}
export function macMediaPermission(permission,origin,enabled){if(!enabled||permission!=='loopback-network')return false;try{const u=new URL(origin);return u.protocol==='app:'&&u.hostname==='desktop'&&!u.port&&!u.username&&!u.password;}catch{return false;}}
