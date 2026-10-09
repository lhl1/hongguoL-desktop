import {useEffect,useMemo,useRef,useState} from 'react';
import type {Library,Series,SeriesFamily} from './types';
import {unwrap} from './types';
import Card from './SeriesCard';
import {CatalogGrid} from './CatalogLayout';

// Keeps paging results in server relevance order; only explicit APK album membership groups works.
export default function SearchResults({items,query,library,onOpen,onFavorite}:{items:Series[];query:string;library:Library;onOpen:(s:Series)=>void;onFavorite:(s:Series)=>void}){
 const [families,setFamilies]=useState<SeriesFamily[]>([]),[grouping,setGrouping]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const known=useRef(new Set<string>());
 useEffect(()=>{known.current.clear();setFamilies([]);setError('');},[query]);
 useEffect(()=>{
  let cancelled=false;
  const missing=items.filter(x=>!known.current.has(x.id)).map(x=>x.id);
  if(!missing.length)return;
  setGrouping(true);setError('');
  void (async()=>{
   for(let offset=0;offset<missing.length;offset+=100){
    const ids=missing.slice(offset,offset+100),data=await unwrap(window.hongguo.seriesGroups(ids));if(cancelled)return;
    setFamilies(old=>{const map=new Map(old.map(x=>[x.id,x]));for(const f of data.families)map.set(f.id,f);return [...map.values()];});
    if(data.unavailable)throw new Error('部分系列暂未加载完成');
    ids.forEach(id=>known.current.add(id));
   }
  })().catch(()=>{if(!cancelled)setError('系列信息暂未加载完成');}).finally(()=>{if(!cancelled)setGrouping(false);});
  return()=>{cancelled=true;};
 },[items,query,retry]);
 const units=useMemo(()=>{
  const byMember=new Map(families.flatMap(f=>f.items.map(s=>[s.id,f] as const))),seen=new Set<string>(),blocks:({type:'family';family:SeriesFamily}|{type:'singles';items:Series[]})[]=[];
  for(const item of items){const family=byMember.get(item.id);if(family){if(seen.has(family.id))continue;seen.add(family.id);blocks.push({type:'family',family});}else{const last=blocks.at(-1);if(last?.type==='singles')last.items.push(item);else blocks.push({type:'singles',items:[item]});}}
  return blocks;
 },[items,families]);
 const followed=useMemo(()=>new Set(library.favorites.map(s=>s.id)),[library.favorites]);
 const originals=new Map(items.map(x=>[x.id,x]));
 const card=(item:Series)=><Card key={item.id} item={originals.get(item.id)?.availability?{...item,availability:originals.get(item.id)!.availability}:item} onOpen={onOpen} onFavorite={onFavorite} followed={followed.has(item.id)}/>;
 return <div className="search-results" aria-label="搜索结果">
  {units.map((unit,index)=>unit.type==='singles'?<CatalogGrid key={'singles-'+index}>{unit.items.map(card)}</CatalogGrid>:<section className="search-family" data-family={unit.family.id} key={unit.family.id} aria-label={unit.family.title+'系列剧'}><div className="search-family-heading"><div><span className="eyebrow">系列剧</span><h2>{unit.family.title}</h2></div><span>共 {unit.family.total} 部 · 按系列顺序</span></div><CatalogGrid>{unit.family.items.map(card)}</CatalogGrid></section>)}
  {error?<div className="series-lookup-status"><span>{error}</span><button className="text-button" onClick={()=>setRetry(n=>n+1)}>重试</button></div>:grouping?<span className="sr-only" role="status">正在整理系列剧</span>:null}
 </div>;
}
