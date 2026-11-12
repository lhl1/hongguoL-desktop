import {FragmentReader,mp4Tracks,fragmentInfo,rewriteFragment} from './iso-fragments.mjs';
export const TIMELINE_MIME='video/mp4; codecs="avc1.640034,flac"';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createMediaTimeline({first,getNext,onChapter=()=>{},onError=()=>{},onItemDone=()=>{},autoNext=true,aggressive=true,fetcher=fetch}){
 if(!MediaSource.isTypeSupported(TIMELINE_MIME))throw new Error('当前播放器不支持连续媒体时间线');
 const source=new MediaSource(),url=URL.createObjectURL(source),chapters=[];let buffer,closed=false,suspended=false,reading=false,clock=0,active=-1,sequence=1,enabled=autoNext,budget=aggressive?75:35,currentReader,controller,nextPending=false,errorSent=false,lastTrim=0,stopAt;
 const valid=()=>!closed&&!suspended;
 const itemDuration=item=>Math.max(.001,item.play.duration-(item.play.startSeconds||0));
 const fail=()=>{if(valid()&&!errorSent){errorSent=true;onError(new Error('连续播放缓冲失败，请重试'));}};
 const locate=time=>{let selected=chapters[0];for(const chapter of chapters)if(time>=chapter.start-1/48000)selected=chapter;return selected;};
 const settle=()=>new Promise((resolve,reject)=>{if(!buffer?.updating){resolve();return;}const done=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(new Error('媒体追加失败'));},cleanup=()=>{buffer.removeEventListener('updateend',done);buffer.removeEventListener('error',bad);buffer.removeEventListener('abort',bad);};buffer.addEventListener('updateend',done,{once:true});buffer.addEventListener('error',bad,{once:true});buffer.addEventListener('abort',bad,{once:true});});
 async function append(bytes){await settle();if(!valid())throw new DOMException('Cancelled','AbortError');for(;;){try{buffer.appendBuffer(bytes);await settle();return;}catch(error){if(error.name!=='QuotaExceededError')throw error;budget=Math.max(8,budget/2);await trim();await pause(250);if(!valid())throw new DOMException('Cancelled','AbortError');}}}
 async function trim(){if(!buffer||buffer.updating||clock<12||clock-lastTrim<5)return;lastTrim=clock;buffer.remove(0,clock-10);await settle();}
 async function reserve(){await trim();while(valid()&&buffer?.buffered.length&&buffer.buffered.end(buffer.buffered.length-1)-clock>budget){await trim();await pause(150);}if(!valid()||controller?.signal.aborted)throw new DOMException('Cancelled','AbortError');}
 async function read(item,start){reading=true;const chapter={item,start,end:start+itemDuration(item),complete:false};chapters.push(chapter);if(active<0){active=0;onChapter(chapter);}controller=new AbortController();const own=controller;
  try{if(source.readyState==='ended'){/* appendBuffer reopens MediaSource */}const response=await fetcher(item.play.url,{signal:own.signal,credentials:'omit'});if(!response.ok||!response.body)throw new Error('媒体连接失败');currentReader=response.body.getReader();const parser=new FragmentReader();let tracks,tail=[],audioEnd=0;
   for(;;){const {value,done}=await currentReader.read();if(own.signal.aborted)throw new DOMException('Cancelled','AbortError');if(done)break;for(const part of parser.push(value)){if(part.init){tracks=mp4Tracks(part.init);await settle();buffer.appendWindowEnd=Infinity;buffer.appendWindowStart=start;buffer.timestampOffset=start;await append(part.init);}else{if(!tracks)throw new Error('媒体初始化顺序无效');for(const t of fragmentInfo(part.fragment,tracks))if(t.type==='soun')audioEnd=Math.max(audioEnd,t.end);tail.push(part.fragment);if(tail.length>2){await reserve();await append(rewriteFragment(tail.shift(),tracks,{sequence:sequence++}));}}}}
   parser.finish();if(!tracks||!tail.length||audioEnd<=0)throw new Error('媒体轨道不完整');chapter.end=start+audioEnd/48000;
   let lastVideo=-1;for(let i=0;i<tail.length;i++)if(fragmentInfo(tail[i],tracks).some(t=>t.type==='vide'))lastVideo=i;if(lastVideo<0)throw new Error('媒体尾帧不完整');
   await settle();buffer.appendWindowEnd=chapter.end;
   for(let i=0;i<tail.length;i++){await reserve();await append(rewriteFragment(tail[i],tracks,{sequence:sequence++,videoEnd:i===lastVideo?audioEnd:undefined}));}
   chapter.complete=true;
  }finally{reading=false;currentReader=undefined;if(controller===own)controller=undefined;onItemDone(item);}
 }
 async function pump(){if(!valid()||reading||nextPending||!buffer)return;const last=chapters.at(-1);if(!last){try{await read(first,0);await pump();}catch(error){if(error.name!=='AbortError')fail();}return;}
  if(!last.complete)return;
  const current=locate(clock),index=chapters.indexOf(current);if(!enabled||stopAt!==undefined&&last.end>=stopAt){await settle();if(valid()&&source.readyState==='open')source.endOfStream();return;}
  if(chapters.length-1>index)return;
  nextPending=true;try{const item=await getNext(last.item);if(!valid()||!enabled){if(item)onItemDone(item);return;}if(!item){await settle();if(source.readyState==='open')source.endOfStream();return;}await read(item,last.end);}catch(error){if(error.name!=='AbortError')fail();}finally{nextPending=false;}
 }
 source.addEventListener('sourceopen',()=>{if(buffer||!valid())return;try{buffer=source.addSourceBuffer(TIMELINE_MIME);buffer.mode='segments';buffer.addEventListener('error',fail);void pump();}catch{fail();}},{once:true});
 return{url,locate,status:()=>({closed,suspended,reading,chapters:chapters.map(c=>({start:c.start,end:c.end,complete:c.complete,episode:c.item.play.episode})),clock}),
  update(time){clock=time;const chapter=locate(time),index=chapters.indexOf(chapter);if(chapter&&index!==active){active=index;onChapter(chapter);}if(valid())void pump();},
  setAutoNext(value){if(enabled===value)return;enabled=value;stopAt=value?undefined:locate(clock)?.end;if(!value&&chapters.length>active+1){controller?.abort();currentReader?.cancel().catch(()=>{});const cutoff=stopAt;chapters.splice(active+1);void(async()=>{while(reading&&valid())await pause(10);await settle();if(valid()&&cutoff!==undefined){buffer.remove(cutoff,Infinity);await settle();if(source.readyState==='open')source.endOfStream();}})().catch(()=>{});}else void pump();},
  suspend(){if(suspended||closed)return;suspended=true;controller?.abort();currentReader?.cancel().catch(()=>{});},
  destroy(){if(closed)return;closed=true;controller?.abort();currentReader?.cancel().catch(()=>{});try{buffer?.abort();}catch{}URL.revokeObjectURL(url);}
 };
}
