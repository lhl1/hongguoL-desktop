import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {runtimePaths} from './runtime-platform.mjs';
import {createMacMediaTransport} from './mac-media-transport.mjs';
import {decoderFailure} from './media-diagnostics.mjs';
import {createMacSourceBridge} from './mac-source-bridge.mjs';
import {createMediaBroker} from './apk-media.mjs';
export async function runMediaSelfTest({app,BrowserWindow,protocol,resources}){
 const folder=process.env.HONGGUO_MEDIA_QA_OUTPUT||path.join(app.getPath('home'),'Library/Logs/Hongguo','Media-check-'+Date.now());
 await fs.mkdir(folder,{recursive:true});
 const report={version:app.getVersion(),platform:process.platform,arch:process.arch,at:new Date().toISOString(),hidden:true,muted:true,syntheticOnly:true,accountAccess:false,realOnlinePlaybackVerified:false,sourceEvents:[]};let transport,window,sourceBridge,broker;
 try{
  // Same fMP4/H264/AAC output options as real playback, without a content key or network input.
  const sample=await new Promise((resolve,reject)=>{const buffers=[];let bytes=0,stderr='';const job=spawn(runtimePaths(resources).ffmpeg,['-hide_banner','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','3','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-g','48','-c:a','aac','-movflags','frag_keyframe+empty_moov+default_base_moof','-frag_duration','200000','-f','mp4','pipe:1'],{windowsHide:true,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{job.kill();reject(Object.assign(new Error('Decoder timeout'),{code:'M106'}));},30000);job.stdout.on('data',b=>{bytes+=b.length;if(bytes>8*1024*1024)job.kill();else buffers.push(b);});job.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-4096);});job.once('error',e=>{clearTimeout(timer);reject(Object.assign(new Error('Decoder failed'),{code:decoderFailure('',e.code)}));});job.once('close',(code,signal)=>{clearTimeout(timer);if(code!==0||!bytes)reject(Object.assign(new Error('Decoder failed'),{code:decoderFailure(stderr,'',signal)}));else resolve(Buffer.concat(buffers));});});
  report.encoder={passed:true,bytes:sample.length};
  const response=()=>new Response(Readable.toWeb(Readable.from([sample])),{headers:{'Content-Type':'video/mp4','Cache-Control':'no-store'}});
  sourceBridge=await createMacSourceBridge({onDiagnostic:v=>report.sourceEvents.push(v),fetcher:async(_url,{headers})=>{
   const match=/^bytes=(\d+)-(\d*)$/.exec(headers.Range||'');
   if(!match)return new Response(sample,{headers:{'Content-Length':String(sample.length)}});
   const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),sample.length-1):sample.length-1;
   if(start>=sample.length)return new Response('',{status:416});
   return new Response(sample.subarray(start,end+1),{status:206,headers:{'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${sample.length}`}});
  }});
  transport=await createMacMediaTransport({stream:(...args)=>broker.stream(...args)});
  broker=createMediaBroker(resources,{baseURL:transport.baseURL,openSource:sourceBridge.open});
  const playback=broker.create({data:{video_model:JSON.stringify({video_duration:3,video_list:[{main_url:'https://v1.qznovelvod.com/synthetic-only.mp4',video_meta:{codec_type:'h264',vtype:'mp4',vheight:180}}]})}},{id:'123456789',cover:'',episodeList:[{number:1,videoId:'987654321'}]},1);
  protocol.handle('app',request=>{const u=new URL(request.url);if(u.hostname!=='desktop')return new Response('',{status:403});if(u.pathname==='/check-media')return response();if(u.pathname==='/media-check.html')return new Response('<!doctype html><html><body style="background:black"><video muted playsinline style="width:320px;height:180px"></video></body></html>',{headers:{'Content-Type':'text/html'}});return new Response('',{status:404});});
  window=new BrowserWindow({show:false,width:400,height:260,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,autoplayPolicy:'no-user-gesture-required'}});window.webContents.setAudioMuted(true);await window.loadURL('app://desktop/media-check.html');
  async function probe(url){return window.webContents.executeJavaScript(`new Promise(resolve=>{const v=document.querySelector('video');v.pause();v.removeAttribute('src');v.load();let done=false;const finish=(value)=>{if(done)return;done=true;clearTimeout(timer);clearInterval(interval);v.pause();resolve(value);};const timer=setTimeout(()=>finish({passed:false,stage:'frame-timeout',mediaError:v.error?.code||null}),15000);const interval=setInterval(()=>{if(v.currentTime>.5&&v.videoWidth&&v.getVideoPlaybackQuality().totalVideoFrames>=3)finish({passed:true,width:v.videoWidth,height:v.videoHeight,frames:v.getVideoPlaybackQuality().totalVideoFrames,audio:v.webkitAudioDecodedByteCount||0});},100);v.onerror=()=>finish({passed:false,stage:'html-video',mediaError:v.error?.code||null});v.src=${JSON.stringify(url)};v.play().catch(()=>finish({passed:false,stage:'play-rejected',mediaError:v.error?.code||null}));})`,true);}
  report.oldCustomProtocol=await probe('app://desktop/check-media');report.loopbackHTTP=await probe(playback.url);report.sourceBridge=sourceBridge.status();report.decoder=broker.status();
  if(window.isVisible()||!window.webContents.isAudioMuted())throw new Error('Hidden test invariant failed');
  await fs.writeFile(path.join(folder,'synthetic-frame.png'),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  report.passed=report.encoder.passed&&report.loopbackHTTP.passed;
 }catch(error){report.passed=false;report.failureCode=/^M\d{3}$/.test(error.code||'')?error.code:'M299';}
 finally{transport?.close();broker?.close();sourceBridge?.close();window?.destroy();await fs.writeFile(path.join(folder,'media-self-test.json'),JSON.stringify(report,null,2));}
 if(!report.passed)throw new Error('Media self-test failed');return report;
}
