import {bufferedAhead} from './playback-recovery.mjs';
export function shouldPreloadNext(video,remaining,producer,seamless,aggressive=true){
 if(!video||video.error||video.readyState<3)return false;
 const ahead=bufferedAhead(video),rate=Math.max(.75,video.playbackRate||1);
 if(producer?.finished)return true;
 const producedAhead=Math.max(0,(producer?.decodedSeconds||0)-video.currentTime)/rate;
 if(producedAhead>=12)return true;
 if(ahead>=Math.max(0,remaining)-.5||ahead/rate>=(aggressive?20:8))return true;
 // Preparing a few seconds of the next episode near the boundary reduces the handoff gap.
 return seamless&&remaining/rate<=18&&(ahead/rate>=2||producedAhead>=3&&ahead/rate>=.6);
}
export function readyForHandoff(video){return !!video&&!video.error&&video.readyState>=2&&video.videoWidth>0&&bufferedAhead(video)>=.25;}
// Keep the outgoing final frame until the target is actually being presented.
// This never advances the target early or skips its opening frames.
export function startFrameHandoff(video,{valid,ready,failed,timeout=1500}){
 let stopped=false,callback,frame,timer;
 const cleanup=()=>{clearTimeout(timer);if(callback!==undefined)video.cancelVideoFrameCallback?.(callback);if(frame!==undefined)cancelAnimationFrame(frame);video.removeEventListener('playing',playing);};
 const finish=()=>{if(stopped)return;stopped=true;cleanup();if(valid())ready();};
 const fail=()=>{if(stopped)return;stopped=true;cleanup();if(valid())failed();};
 const playing=()=>{if(!video.requestVideoFrameCallback)frame=requestAnimationFrame(finish);};
 video.addEventListener('playing',playing);
 if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback(finish);
 timer=setTimeout(()=>{if(!video.paused&&video.readyState>=2)finish();else fail();},timeout);
 try{Promise.resolve(video.play()).catch(fail);}catch{queueMicrotask(fail);}
 return{cancel(){if(stopped)return;stopped=true;cleanup();}};
}
