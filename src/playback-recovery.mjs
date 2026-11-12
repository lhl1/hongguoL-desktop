export const PAUSE_RELEASE_MS=60000;
export const WAIT_RECOVERY_MS=12000;
export function stalePlayback(play,released=false,now=Date.now()) {
 return released || now >= (play.expiresAt || play.fetchedAt+300000)-15000;
}
// Stale DOM events from replaced sources must never reload a newer selection.
export function currentPlaybackEvent(slot,entry,renderedSerial,source) {
 return !!entry && entry.serial===renderedSerial && (entry.source||entry.play.url)===source;
}
export function createRecoveryBudget(maximum=2) {
 let attempts=0,healthy=0,previous;
 return {take:()=>{healthy=0;previous=undefined;return attempts<maximum?(attempts++,true):false;},reset:()=>{attempts=0;healthy=0;previous=undefined;},count:()=>attempts,
  progress:seconds=>{if(previous!==undefined){const delta=seconds-previous;if(delta>0&&delta<3)healthy+=delta;else if(delta<0||delta>=3)healthy=0;}previous=seconds;if(healthy>=10){attempts=0;healthy=0;}}
 };
}
export function bufferedAhead(video){
 if(!video)return 0;const seconds=video.currentTime;
 for(let i=0;i<video.buffered.length;i++)if(video.buffered.start(i)<=seconds+.1&&video.buffered.end(i)>seconds)return video.buffered.end(i)-seconds;
 return 0;
}
export function canPrefetch(video,remaining,aggressive=true){
 if(!video||video.error||video.readyState<3)return false;
 const ahead=bufferedAhead(video),rate=Math.max(.75,video.playbackRate||1);
 return ahead>=Math.max(0,remaining)-.5||ahead/rate>=(aggressive?20:8);
}
// Sampling continuously also catches freezes without a waiting event or exact float equality.
export function createPlaybackWatchdog(){
 let source,seconds=0,lastProgress=0;
 return {observe(value,now=performance.now()){
  if(source!==value.source||!value.playing||value.held||value.ended){source=value.source;seconds=value.seconds;lastProgress=now;return false;}
  if(value.seconds>seconds+.08||value.seconds<seconds-.5){seconds=value.seconds;lastProgress=now;return false;}
  if(now-lastProgress>=(value.aggressive?6000:10000)){lastProgress=now;return true;}return false;
 }};
}
