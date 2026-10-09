import {useEffect,useRef,useState} from 'react';
import type {FilterRow,FilterItem,Library,Page,Series} from './types';
import {unwrap} from './types';
import {toggleFilter} from './filter-selection.mjs';
import SeriesCard from './SeriesCard';
import LoadMore from './LoadMore';
import {Icon} from './ui';
import {CatalogGrid,CatalogViewSwitch} from './CatalogLayout';
export default function CategoryFilters({library,onOpen,onFavorite,onClose}:{library:Library;onOpen:(s:Series)=>void;onFavorite:(s:Series)=>void;onClose:()=>void}){
 const [page,setPage]=useState<Page>(),[selected,setSelected]=useState<Record<string,string[]>>({}),[busy,setBusy]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState(true);
 const sequence=useRef(0),flight=useRef(false),current=useRef(page),selection=useRef(selected);current.current=page;selection.current=selected;
 async function load(value=selection.current,more=false,reset=false){
  const old=current.current;if(more&&(flight.current||!old?.hasMore))return;
  const token=++sequence.current;flight.current=true;setBusy(true);setError('');
  if(!more)setPage(previous=>previous?{...previous,items:[],hasMore:false,cursor:''}:previous);
  try{const data=await unwrap(window.hongguo.filterCatalog(reset||!old?.filterContext?{}:{context:old.filterContext,selectItems:value},more?old?.cursor:''));
   if(token!==sequence.current)return;
   const next=more&&old?{...data,items:[...old.items,...data.items.filter(x=>!old.items.some(y=>y.id===x.id))]}:data;
   current.current=next;setPage(next);selection.current=data.selectedFilters||{};setSelected(selection.current);
  }catch(e){if(token===sequence.current)setError(e instanceof Error?e.message:'筛选暂不可用');}
  finally{if(token===sequence.current){flight.current=false;setBusy(false);}}
 }
 useEffect(()=>{void load();return()=>{sequence.current++;flight.current=false;};},[]);
 function choose(row:FilterRow,item?:FilterItem){
  const type=row.type!;const before=selection.current[type]||[];
  if(!item&&[3,4].includes(row.selectionType||0))return;
  const value=item?toggleFilter(before,row,item,'rank'):[];
  if(JSON.stringify(value)===JSON.stringify(before))return;
  const next={...selection.current,[type]:value};selection.current=next;setSelected(next);void load(next);
 }
 const rows=page?.rows||[],visible=expanded?rows:rows.slice(0,page?.maxExpand||3);
 return <section className="category-browser official-category" aria-busy={busy}>
  <header className="filter-page-heading"><div className="filter-page-title"><button className="filter-back" aria-label="返回探索" title="返回探索" onClick={onClose}><Icon name="back" size={18}/></button><div><h2>筛选</h2><p>找到合你心意的好剧</p></div></div><button className="filter-reset" onClick={()=>{selection.current={};setSelected({});void load({},false,true);}}><Icon name="sync" size={14}/>重置</button></header>
  <div className="official-filters" aria-label="剧集筛选">
   {visible.map(row=>{const value=selected[row.type!]||[];return <div className="official-filter-row" data-filter-row={row.type} key={row.type}>
    <button className={'filter-all '+(!value.length?'selected':'')} aria-pressed={!value.length} disabled={[3,4].includes(row.selectionType||0)} onClick={()=>choose(row)}>{row.title}</button>
    <div className="official-filter-track" role="group" aria-label={row.title}>{row.items.filter(item=>item.id).map(item=><button key={item.id} data-filter-option={item.id} aria-pressed={value.includes(item.id)} className={value.includes(item.id)?'selected':''} onClick={()=>choose(row,item)}>{item.title}</button>)}</div>
   </div>;})}
   {!rows.length&&busy&&Array.from({length:8},(_,i)=><div className="official-filter-skeleton" key={i} aria-hidden="true"><i/><span/></div>)}
   {rows.length>3&&<button className="filter-fold" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开筛选'}<Icon name={expanded?"up":"down"} size={14}/></button>}
  </div>
  <div className="catalog-results-heading"><span>{busy?'正在更新剧集':'筛选结果'}</span><CatalogViewSwitch/></div><CatalogGrid>{page?.items.map(item=><SeriesCard key={item.id} item={item} followed={library.favorites.some(f=>f.id===item.id)} onOpen={onOpen} onFavorite={onFavorite} showMetric/>)}{busy&&!page?.items.length&&Array.from({length:8},(_,i)=><div className="explore-placeholder" aria-hidden="true" key={i}><div/><i/></div>)}</CatalogGrid>
  {page?.items.length?<LoadMore hasMore={page.hasMore} busy={busy} error={error} className="explore-more" onMore={()=>void load(selection.current,true)}/>:!busy&&!error?<p className="empty-state">原版服务当前没有符合条件的剧集</p>:null}
  {error&&<p className="error-state" role="alert">{error}<button onClick={()=>void load(selection.current,false,error.includes('过期'))}>重试</button></p>}
 </section>;
}