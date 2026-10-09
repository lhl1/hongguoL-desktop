import {useEffect,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {FilterRow} from './types';
import {toggleFilter} from './filter-selection.mjs';
import {Icon} from './ui';

function FilterChoice({row,ids,onChange,source}:{row:FilterRow;ids:string[];onChange:(ids:string[])=>void;source:'rank'|'category'}){
 const root=useRef<HTMLDetailsElement>(null),[open,setOpen]=useState(false);
 const [position,setPosition]=useState<CSSProperties>({visibility:'hidden'});
 const chosen=row.items.filter(x=>ids.includes(x.id)||!x.id&&!ids.some(id=>row.items.some(y=>y.id===id)));
 useEffect(()=>{
  if(!open)return;
  const el=root.current!,rect=el.querySelector('summary')!.getBoundingClientRect();
  const width=Math.min(360,innerWidth-32),below=innerHeight-rect.bottom-20,above=rect.top-20;
  const upwards=below<220&&above>below,height=Math.min(340,upwards?above:below);
  setPosition({left:Math.max(16,Math.min(rect.left,innerWidth-width-16)),width,maxHeight:height,...(upwards?{bottom:innerHeight-rect.top+8,top:'auto'}:{top:rect.bottom+8,bottom:'auto'}),visibility:'visible'});
 },[open]);
 useEffect(()=>{
  const el=root.current!;
  const close=()=>{if(el.open)el.open=false;};
  const outside=(e:PointerEvent)=>{if(!el.contains(e.target as Node))close();};
  const key=(e:KeyboardEvent)=>{if(el.open&&e.key==='Escape'){e.preventDefault();e.stopPropagation();close();el.querySelector('summary')!.focus({preventScroll:true});}};
  const scroll=(e:Event)=>{if(!el.querySelector('.filter-options')?.contains(e.target as Node))close();};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',close);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',close);};
 },[]);
 return <details ref={root} name="catalog-filter" className="filter-choice" onToggle={e=>{setOpen(e.currentTarget.open);if(!e.currentTarget.open)setPosition({visibility:'hidden'});}}><summary aria-label={row.title+'筛选'} aria-expanded={open}><span>{row.title}</span><strong>{chosen.map(x=>x.title).join('、')||row.items.find(x=>x.selected)?.title||'全部'}</strong><Icon name="down" size={14}/></summary><div className="filter-options" style={position} role="group" aria-label={row.title}><div className="filter-options-heading"><strong>{row.title}</strong><span>{row.limit?`最多 ${row.limit} 项`:'选择分类'}</span></div><div className="filter-options-grid">{row.items.map((item,i)=><button key={item.id+':'+i} aria-pressed={chosen.includes(item)} className={chosen.includes(item)?'selected':''} onClick={()=>{onChange(toggleFilter(ids,row,item,source));if(row.selectionType!==1&&!(source==='rank'&&row.selectionType===4))root.current!.open=false;}}>{item.title}</button>)}</div></div></details>;
}
export default function FilterControls({rows,ids,onChange,source='rank'}:{rows:FilterRow[];ids:string[];onChange:(ids:string[])=>void;source?:'rank'|'category'}){
 return <div className="rank-filter-selects">{rows.map((row,index)=><FilterChoice row={row} ids={ids} onChange={onChange} source={source} key={row.type+':'+row.title+index}/>)}</div>;
}
