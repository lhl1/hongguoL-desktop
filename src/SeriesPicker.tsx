import {useEffect,useRef,useState} from 'react';
import type {Series,SeriesFamily} from './types';
import {unwrap} from './types';
import {Cover} from './ui';

export default function SeriesPicker({current,pending,onChoose,preview=false}:{current:Series;pending?:string;onChoose:(s:Series)=>void;preview?:boolean}){
 const [family,setFamily]=useState<SeriesFamily|null>(),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const cached=useRef(new Map<string,SeriesFamily|null>());
 useEffect(()=>{
  let cancelled=false;setError('');const old=cached.current.get(current.id);setFamily(old);
  if(cached.current.has(current.id))return;
  void unwrap(window.hongguo.family(current.id)).then(data=>{
   if(cancelled)return;cached.current.set(current.id,data);for(const item of data?.items||[])cached.current.set(item.id,data);setFamily(data);
  }).catch(()=>{if(!cancelled)setError('系列信息暂未加载完成');});
  return()=>{cancelled=true;};
 },[current.id,retry]);
 if(error)return <div className="series-lookup-status"><span>{error}</span><button className="text-button" onClick={()=>{cached.current.delete(current.id);setRetry(n=>n+1);}}>重试</button></div>;
 if(!family)return null;
 return <section className="series-picker" aria-label="系列剧"><div className="series-picker-heading"><h3>系列剧 · 共 {family.total} 部</h3><span>{family.title}</span></div><div className="season-list">
  {family.items.map(item=><button key={item.id} className={'season-button '+(item.id===(pending||current.id)?'selected':'')} data-series={item.id} aria-pressed={item.id===current.id} onClick={()=>onChoose(item)}>
   <Cover source={item.cover} seriesId={item.id} title={item.title}/><span><strong>{item.title}</strong><small>全 {item.episodes} 集</small></span><em>{item.id===pending?'正在切换':item.id===current.id?(preview?'已选':'播放中'):(preview?'选择':'播放')}</em>
  </button>)}
 </div></section>;
}
