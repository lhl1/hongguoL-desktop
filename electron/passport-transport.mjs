// Passport needs every Set-Cookie, including when Chromium folds repeated headers.
export function splitSetCookies(values){
 return (Array.isArray(values)?values:[values]).filter(v=>typeof v==='string').flatMap(v=>v.split(/,\s*(?=[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/)).map(v=>v.trim()).filter(Boolean);
}
export function responseCookies(headers){const values=headers.getSetCookie?.()||[];return splitSetCookies(values.length?values:headers.get('set-cookie')||[]);}
export function createPassportFetch(net){
 return async(url,options={})=>{
  const target=new URL(url);if(target.origin!=='https://security.snssdk.com'||!['/passport/mobile/send_code/v1/','/passport/mobile/sms_login/','/passport/account/info/v2/'].includes(target.pathname))throw new Error('账号接口地址无效');
  return new Promise((resolve,reject)=>{
   let finished=false,request;const signal=options.signal;
   const finish=(error,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);};
   const abort=()=>{finish(new Error('登录请求已取消或超时'));request?.abort();};
   try{
    request=net.request({url:target.href,method:options.method||'GET',redirect:'error',useSessionCookies:false});
    request.on('error',()=>finish(new Error('无法连接登录服务，请稍后重试')));
    request.on('response',response=>{
     const chunks=[];let bytes=0;
     response.on('error',()=>finish(new Error('登录服务响应中断')));
     response.on('data',chunk=>{bytes+=chunk.length;if(bytes>8*1024*1024){finish(new Error('登录响应过大'));request.abort();}else chunks.push(chunk);});
     response.on('end',()=>{if(finished)return;try{
      const headers=new Headers();for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
      const status=response.statusCode;finish(null,new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers}));
     }catch{finish(new Error('登录服务响应格式无效'));}});
    });
    for(const [name,value]of Object.entries(options.headers||{}))request.setHeader(name,value);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
    if(options.body!==undefined)request.write(options.body);request.end();
   }catch{finish(new Error('登录请求无法创建'));request?.abort();}
  });
 };
}
