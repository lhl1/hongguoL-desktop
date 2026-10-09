import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Detail,Library,Playback,Series,Preferences,WindowState} from './types';
import {unwrap} from './types';
import {Cover,Icon} from './ui';
import DramaDetails from './DramaDetails';
import SelectMenu from './SelectMenu';
import {createWheelGate} from './gesture.mjs';
import {animateFrames} from './video-transition.mjs';
import {isCurrentMediaError} from './media-events.mjs';
const api=window.hongguo;
const message=(e:unknown)=>e instanceof Error?e.message:'播放暂不可用，请重试';
const time=(n:number)=>Math.floor(n/60)+':'+Math.floor(n%60).toString().padStart(2,'0');
type BufferEntry={detail:Detail;play:Playback;ready:boolean;serial:number};
type Target={series:Series;episode?:number;start?:number;quality:string;direction?:number};
export default function Player({series,nextSeries,initialEpisode,playRequested=false,browseDirection=1,library,preferences,presentation='detail',onLibrary,onClose,onBrowse,notify}:{series:Series;nextSeries?:Series;initialEpisode?:number;playRequested?:boolean;browseDirection?:number;library:Library;preferences:Preferences;presentation?:'feed'|'detail';onLibrary:(l:Library)=>void;onClose:()=>void;onBrowse?:(direction:number)=>void;notify:(s:string)=>void}){
 const [slots,setSlots]=useState<(BufferEntry|undefined)[]>([]),[active,setActive]=useState(-1),[drawer,setDrawer]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const [speed,setSpeed]=useState(preferences.defaultSpeed),[volume,setVolume]=useState(preferences.volume),[muted,setMuted]=useState(false),[quality,setQuality]=useState(preferences.defaultQuality),[automatic,setAutomatic]=useState(preferences.autoNext);
 const [elapsed,setElapsed]=useState(0),[paused,setPaused]=useState(true),[controls,setControls]=useState(true),[mode,setMode]=useState<WindowState>({mode:'normal',fullscreen:false,maximized:false});
 const [selectOpen,setSelectOpen]=useState(false);
 const [pendingSeason,setPendingSeason]=useState<string>();
 const [selectedEpisode,setSelectedEpisode]=useState<{seriesId:string;number:number}>();
 const [turning,setTurning]=useState(false),[visible,setVisible]=useState(-1),transition=useRef<(ReturnType<typeof animateFrames>&{old:number})|undefined>(undefined);
 const frames=useRef<(HTMLDivElement|null)[]>([]);
 const videos=useRef<(HTMLVideoElement|null)[]>([]),entries=useRef<(BufferEntry|undefined)[]>([]),activeRef=useRef(-1),pending=useRef<{slot:number;target:Target;serial:number;wanted:boolean;autoplay:boolean}|undefined>(undefined),serial=useRef(0),alive=useRef(true);
 const hideTimer=useRef<ReturnType<typeof setTimeout>>(undefined),seekTimer=useRef<ReturnType<typeof setTimeout>>(undefined),lastSaved=useRef(0),gate=useRef(createWheelGate()),stage=useRef<HTMLDivElement>(null),drawerRef=useRef<HTMLElement>(null),previousFocus=useRef<HTMLElement|null>(null),held=useRef(false),seekResume=useRef(true),lastRequest=useRef<Target|undefined>(undefined);
 const latest=useRef({library,onLibrary,notify,preferences,onBrowse,drawer,selectOpen,mode,quality,speed,volume,muted,automatic});latest.current={library,onLibrary,notify,preferences,onBrowse,drawer,selectOpen,mode,quality,speed,volume,muted,automatic};
 const current=slots[active],d=current?.detail||series,ep=current?.play.episode||1,duration=current?.play.duration||0,immersive=mode.mode==='window'||mode.fullscreen;
 const displayEpisode=selectedEpisode?.seriesId===d.id?selectedEpisode.number:ep;
 const lastPosition=useRef({seriesId:'',episode:0,seconds:0});
 const v=()=>videos.current[activeRef.current];
 function logVideo(slot:number,event:string){const el=videos.current[slot];if(!el||!entries.current[slot])return;void api.logVideo({event,error:el.error?.code,ready:el.readyState,network:el.networkState,width:el.videoWidth,height:el.videoHeight,seconds:el.currentTime}).catch(()=>{});}
 function goBack(){if(presentation==='detail')close();else if(mode.fullscreen)void unwrap(api.windowControl('fullscreen')).then(setMode);else if(mode.mode==='window')void unwrap(api.windowControl('window')).then(setMode);}
 const position=()=>{const e=entries.current[activeRef.current],el=v();if(!e)return 0;if(el){const seconds=el.currentTime+(e.play.startSeconds||0);lastPosition.current={seriesId:e.detail.id,episode:e.play.episode,seconds};return seconds;}return lastPosition.current.seriesId===e.detail.id&&lastPosition.current.episode===e.play.episode?lastPosition.current.seconds:e.play.startSeconds||0;};
 function persist(){const e=entries.current[activeRef.current],seconds=position();if(e&&seconds>=0)void unwrap(api.progress({...e.detail,episode:e.play.episode,seconds})).then(latest.current.onLibrary).catch(()=>{});}
 function scheduleHide(){clearTimeout(hideTimer.current);hideTimer.current=setTimeout(()=>{if(!latest.current.drawer&&!latest.current.selectOpen)setControls(false);},1600);}
 function reveal(){setControls(true);scheduleHide();}
 function release(slot:number){const entry=entries.current[slot];if(entry){const el=videos.current[slot];el?.pause();el?.removeAttribute('src');el?.load();entries.current[slot]=undefined;void api.release(entry.play.url);}setSlots([...entries.current]);}
 function matches(t:Target,p:typeof pending.current){return p&&p.target.series.id===t.series.id&&(t.episode===undefined||p.target.episode===t.episode)&&p.target.quality===t.quality&&(t.start===undefined||t.start===p.target.start);}
 function finishTurn(){const animation=transition.current;if(!animation)return;transition.current=undefined;animation.cancel();if(animation.old!==activeRef.current)release(animation.old);setTurning(false);}
 function beginTarget(slot:number,target:Target){setSelectedEpisode(target.episode===undefined?undefined:{seriesId:target.series.id,number:target.episode});persist();v()?.pause();held.current=true;setBusy(true);setError('');
  const old=activeRef.current,previous=frames.current[old],next=frames.current[slot];
  if(old>=0&&target.direction&&previous&&next){setVisible(slot);
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches){const animation={...animateFrames(previous,next,target.direction),old};transition.current=animation;setTurning(true);void animation.finished.then(()=>{if(alive.current&&transition.current===animation)finishTurn();});}
  }else if(old>=0)setVisible(old);
 }
 function commit(slot:number){const p=pending.current,e=entries.current[slot],el=videos.current[slot];if(!p||p.slot!==slot||!p.wanted||!e?.ready||!el)return;
  persist();const old=activeRef.current;v()?.pause();activeRef.current=slot;setActive(slot);setVisible(slot);transition.current?.ready();pending.current=undefined;held.current=false;setBusy(false);setPendingSeason(undefined);setSelectedEpisode(undefined);setError('');setElapsed(e.play.startSeconds||0);el.playbackRate=latest.current.speed;el.volume=latest.current.volume;el.muted=latest.current.muted;setPaused(!p.autoplay);
  if(p.autoplay)void el.play().catch(error=>{if(activeRef.current===slot&&entries.current[slot]===e&&!held.current&&error.name!=='AbortError'){setPaused(true);latest.current.notify('点击播放继续观看');}});else el.pause();
  if(old>=0&&old!==slot&&!transition.current)release(old);
  if(latest.current.mode.fullscreen||latest.current.mode.mode==='window'){clearTimeout(hideTimer.current);if(!latest.current.drawer)setControls(false);}else reveal();
 }
 async function prepare(target:Target,wanted:boolean,autoplay:boolean){
  if(wanted)finishTurn();else if(transition.current)return;
  lastRequest.current=wanted?target:lastRequest.current;
  if(matches(target,pending.current)){pending.current!.wanted ||= wanted;pending.current!.autoplay=autoplay;if(wanted){pending.current!.target.direction=target.direction;beginTarget(pending.current!.slot,target);commit(pending.current!.slot);}return;}
  const token=++serial.current,slot=activeRef.current===0?1:0;
  pending.current={slot,target,serial:token,wanted,autoplay};release(slot);
  if(wanted)beginTarget(slot,target);
  try{
   const detail=await unwrap(api.detail(target.series.id));if(!alive.current||serial.current!==token)return;
   const saved=latest.current.library.history.find(x=>x.id===target.series.id);
   const episode=target.episode??(detail.episodeList.some(x=>x.number===saved?.episode&&!x.locked)?saved!.episode:detail.episodeList.find(x=>!x.locked)?.number||1);
   const start=target.start??(target.episode===undefined&&saved?.episode===episode?saved.seconds:0);
   pending.current!.target={...target,episode,start};
   const play=await unwrap(api.playback(target.series.id,episode,start,target.quality));
   if(!alive.current||serial.current!==token){void api.release(play.url);return;}
   entries.current[slot]={detail,play,ready:false,serial:token};setSlots([...entries.current]);
  }catch(e){if(!alive.current||serial.current!==token)return;const intended=pending.current?.wanted;pending.current=undefined;if(intended){finishTurn();setVisible(activeRef.current);setBusy(false);setPendingSeason(undefined);setSelectedEpisode(undefined);setError(message(e));}}
 }
 function decoded(slot:number){const e=entries.current[slot],p=pending.current,el=videos.current[slot];if(!e||!p||p.slot!==slot||p.serial!==e.serial||!el)return;
  if(el.readyState<2||!el.videoWidth||el.getAttribute('src')!==e.play.url)return;
  e.ready=true;setSlots([...entries.current]);if(p.wanted)commit(slot);
 }
 useEffect(()=>{alive.current=true;void unwrap(api.windowControl('state')).then(setMode);const off=api.onWindow(setMode);return()=>{alive.current=false;serial.current++;transition.current?.cancel();transition.current=undefined;clearTimeout(hideTimer.current);clearTimeout(seekTimer.current);persist();for(const e of entries.current)if(e)void api.release(e.play.url);off();};},[]);
 useEffect(()=>{void prepare({series,episode:initialEpisode,quality:latest.current.quality,direction:browseDirection},true,presentation==='feed'?preferences.homeAutoplay:playRequested||preferences.autoplay);},[series.id]);
 useEffect(()=>{if(presentation==='detail'&&preferences.defaultMode==='window')void unwrap(api.windowControl('window')).then(setMode);return()=>{void api.windowControl('normal');};},[]);
 useEffect(()=>{if(!current||busy||turning||pending.current?.wanted)return;const next=immersive||presentation==='detail'?current.detail.episodeList.find(x=>x.number===ep+1&&!x.locked):undefined;const target=next?{series:current.detail,episode:next.number,start:0,quality}:!immersive&&presentation==='feed'&&nextSeries?{series:nextSeries,quality}:undefined;if(target)void prepare(target,false,true);},[active,ep,immersive,nextSeries?.id,quality,busy,turning]);
 useEffect(()=>{const el=v();if(el){el.volume=volume;el.muted=muted;el.playbackRate=speed;}},[volume,muted,speed]);
 useEffect(()=>{if(drawer){previousFocus.current=document.activeElement as HTMLElement;drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();setControls(true);}else previousFocus.current?.focus();},[drawer]);
 function chooseSeason(item:Series){if(item.id===pendingSeason||item.id===d.id&&!pendingSeason)return;const returning=item.id===d.id;setPendingSeason(item.id);void prepare({series:item,...(returning?{episode:ep,start:position()}:{}),quality:latest.current.quality},true,preferences.autoplay);}
 function changeEpisode(next:number){const e=entries.current[activeRef.current],request=pending.current;if(!e||!e.detail.episodeList.some(x=>x.number===next&&!x.locked))return;if(next===e.play.episode&&!request?.wanted||request?.wanted&&request.target.series.id===e.detail.id&&request.target.episode===next)return;void prepare({series:e.detail,episode:next,start:next===e.play.episode?position():0,quality:latest.current.quality,direction:Math.sign(next-e.play.episode)},true,true);}
 function seek(seconds:number){const e=entries.current[activeRef.current];if(!e)return;const target=Math.max(0,Math.min(e.play.duration-.5,seconds));const autoplay=held.current?seekResume.current:!v()?.paused;void prepare({series:e.detail,episode:e.play.episode,start:target,quality:latest.current.quality},true,autoplay);}
 function queueSeek(seconds:number){logVideo(activeRef.current,'seek');persist();if(!held.current)seekResume.current=!v()?.paused;v()?.pause();held.current=true;setElapsed(seconds);clearTimeout(seekTimer.current);seekTimer.current=setTimeout(()=>seek(seconds),180);}
 function toggle(){if(busy)return;const el=v();if(!el)return;if(el.paused)void el.play();else el.pause();reveal();}
 function close(){persist();void api.windowControl('normal');onClose();}
 const actions=useRef({toggle,seek,changeEpisode,close,reveal});actions.current={toggle,seek,changeEpisode,close,reveal};
 useEffect(()=>{const root=stage.current;if(!root)return;const wheel=(event:WheelEvent)=>{if(Math.abs(event.deltaX)>Math.abs(event.deltaY))return;const target=event.target as HTMLElement;const blocked=!!transition.current||!!pending.current?.wanted||latest.current.drawer||latest.current.selectOpen||!!target.closest('input,select,button,.video-controls,.episode-panel');const direction=gate.current(event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1),performance.now(),blocked);if(blocked)return;event.preventDefault();if(!direction)return;if(latest.current.mode.fullscreen||latest.current.mode.mode==='window'||presentation==='detail'){const e=entries.current[activeRef.current];if(e)actions.current.changeEpisode(e.play.episode+direction);}else latest.current.onBrowse?.(direction);};root.addEventListener('wheel',wheel,{passive:false});return()=>root.removeEventListener('wheel',wheel);},[]);
 useEffect(()=>{function key(event:KeyboardEvent){const t=event.target as HTMLElement;if(event.key==='Escape'){if(latest.current.drawer)setDrawer(false);else if(latest.current.mode.fullscreen)void api.windowControl('fullscreen');else if(latest.current.mode.mode==='window')void api.windowControl('window');else if(presentation==='detail')actions.current.close();return;}
  if(event.key==='Tab'&&latest.current.drawer){const nodes=Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select')||[]);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}
  if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(t.tagName))return;if(event.code==='Space'){event.preventDefault();actions.current.toggle();}else if(event.key==='ArrowRight'){event.preventDefault();actions.current.seek(position()+5);}else if(event.key==='ArrowLeft'){event.preventDefault();actions.current.seek(position()-5);}else if(event.key.toLowerCase()==='f')void api.windowControl('fullscreen');}
 document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[]);
 const favorite=library.favorites.some(x=>x.id===d.id);
 return <div className={['player-overlay',presentation==='feed'?'player-feed':'',immersive?'player-window':''].join(' ')} role={presentation==='detail'?'dialog':undefined} aria-modal={presentation==='detail'?true:undefined} aria-label={d.title} data-episode={ep} data-selected-episode={displayEpisode} data-series={d.id} data-busy={busy} data-turning={turning}>
  <div className={'video-stage '+(controls||drawer||selectOpen?'controls-visible':'controls-hidden')} ref={stage} tabIndex={0} onPointerMove={reveal} onPointerLeave={()=>{clearTimeout(hideTimer.current);if(!drawer&&!latest.current.selectOpen)setControls(false);}}>
   {mode.mode==='window'&&!mode.fullscreen&&!drawer&&<div className="video-window-drag" aria-hidden="true"/>}
   {[0,1].map(slot=><div key={slot} ref={el=>{frames.current[slot]=el;}} className={'video-frame '+(slot===visible?'visible-frame':'buffer-frame')} data-slot={slot}><video ref={el=>{videos.current[slot]=el;}} className={slot===active?'active-video':'buffer-video'} src={slots[slot]?.play.url} playsInline preload="auto" muted={slot!==active||muted} onClick={toggle} onDoubleClick={()=>void api.windowControl('fullscreen')}
    onLoadedData={()=>{logVideo(slot,'loadeddata');decoded(slot);}} onPlaying={()=>logVideo(slot,'playing')} onWaiting={()=>logVideo(slot,'waiting')} onStalled={()=>logVideo(slot,'stalled')} onPlay={()=>{if(slot===activeRef.current)setPaused(false);}} onPause={()=>{if(slot===activeRef.current&&!held.current)setPaused(true);}}
    onTimeUpdate={()=>{if(slot!==activeRef.current||held.current)return;setElapsed(position());if(Date.now()-lastSaved.current>10000){lastSaved.current=Date.now();persist();}}}
    onEnded={()=>{if(slot===activeRef.current){persist();if(latest.current.automatic)changeEpisode(entries.current[slot]!.play.episode+1);}}}
    onError={()=>{logVideo(slot,'error');const entry=entries.current[slot],request=pending.current,el=videos.current[slot];if(isCurrentMediaError(slot,entry,request,slots[slot]?.serial,el?.getAttribute('src')||null,el?.error||null)){const wanted=request!.wanted;pending.current=undefined;release(slot);if(wanted){finishTurn();setVisible(activeRef.current);setBusy(false);setPendingSeason(undefined);setSelectedEpisode(undefined);setError('视频暂时无法播放，请重试。');if(api.platform==='darwin')void unwrap(api.mediaDiagnostics()).then(result=>{if(alive.current&&serial.current===entry?.serial)setError(result.message+'（'+(result.last?.code||'M201')+'）');}).catch(()=>{});}}}} /></div>)}
   {error&&<div className="video-message" role="alert"><p>{error}</p><button className="primary" onClick={()=>lastRequest.current&&void prepare(lastRequest.current,true,true)}>重试播放</button></div>}
   {paused&&current&&!busy&&!error&&<button className="big-play" aria-label="开始播放" onClick={toggle}><Icon name="play" size={28}/></button>}
   <div className="player-floating-top">{(presentation==='detail'||immersive)&&<button className="back-button" aria-label="返回" onClick={goBack}><Icon name="back"/>返回</button>}<span>{d.title} · 第 {displayEpisode} 集</span></div>
   <div className="video-controls" onPointerEnter={reveal} onPointerLeave={scheduleHide} onFocus={reveal} onBlur={scheduleHide}>
    <input aria-label="播放进度" type="range" min={0} max={duration||1} step={.1} value={Math.min(elapsed,duration)} className="progress-slider" style={{'--seek-progress':`${duration?Math.min(100,Math.max(0,elapsed/duration*100)):0}%`} as CSSProperties} disabled={!current} onChange={event=>queueSeek(Number(event.target.value))}/>
    <div className="control-row"><button aria-label={paused?'播放':'暂停'} onClick={toggle} disabled={!current}><Icon name={paused?'play':'pause'} size={18}/></button><button aria-label="下一集" onClick={()=>changeEpisode(ep+1)} disabled={!current?.detail.episodeList.some(x=>x.number===ep+1&&!x.locked)}><Icon name="next" size={18}/></button><span className="time-label">{time(elapsed)} / {time(duration)}</span><div className="control-spacer"/>
     <div className="volume-control"><button aria-label={muted?'取消静音':'静音'} onClick={()=>setMuted(!muted)}><Icon name={muted||volume===0?'muted':'sound'} size={18}/></button><input className="volume-slider" aria-label="视频音量" type="range" min={0} max={1} step={.01} value={volume} style={{'--volume-progress':`${muted?0:volume*100}%`} as CSSProperties} onChange={event=>{setVolume(Number(event.target.value));setMuted(false);}}/></div>
     <SelectMenu label="清晰度" value={quality} options={[{value:'highest',label:'最高'+(current?' · '+current.play.quality+'P':'')},...(current?.play.qualities.map(q=>({value:q.id,label:q.label}))||[])]} media onOpenChange={open=>{setSelectOpen(open);reveal();}} onChange={q=>{setQuality(q);const e=entries.current[activeRef.current];if(e)void prepare({series:e.detail,episode:e.play.episode,start:position(),quality:q},true,!v()?.paused);}}/>
     <SelectMenu label="播放速度" value={String(speed)} options={[.75,1,1.25,1.5,2].map(s=>({value:String(s),label:s+'×'}))} media onOpenChange={open=>{setSelectOpen(open);reveal();}} onChange={v=>setSpeed(Number(v))}/>
     <button className="episode-toggle" aria-label="选集" aria-expanded={drawer} onClick={()=>setDrawer(!drawer)}><Icon name="episodes" size={17}/>选集 <span className="episode-current">{displayEpisode} / {d.episodes}</span></button><button className="window-toggle" aria-label="窗口无边框播放" aria-pressed={mode.mode==='window'} onClick={()=>void unwrap(api.windowControl('window')).then(setMode)}><Icon name="window" size={18}/></button><button aria-label="全屏" aria-pressed={mode.fullscreen} onClick={()=>void unwrap(api.windowControl('fullscreen')).then(setMode)}><Icon name="fullscreen" size={18}/></button>
    </div>
   </div>
   {drawer&&<><button className="drawer-backdrop" aria-label="收起选集" onClick={()=>setDrawer(false)}/><aside className="episode-panel episode-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="详情与选集"><header className="detail-dialog-heading drawer-heading"><div><span>当前第 {displayEpisode} 集</span><h2>详情与选集</h2></div><button aria-label="收起选集" onClick={()=>setDrawer(false)}><Icon name="close" size={18}/></button></header><div className="detail-scroll">{current&&<DramaDetails key={d.id} detail={current.detail} library={library} episode={displayEpisode} onFavorite={()=>void unwrap(api.favorite(d)).then(onLibrary).catch(e=>notify(message(e)))} onEpisode={n=>current.detail.episodeList.find(x=>x.number===n)?.locked?notify('这一集需要原版授权'):changeEpisode(n)} onSeason={chooseSeason} pendingSeason={pendingSeason} automatic={automatic} onAutomatic={setAutomatic}/>}</div></aside></>}
  </div>
 </div>;
}
