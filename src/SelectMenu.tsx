import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {CSSProperties} from 'react';
import {Icon} from './ui';
export type SelectOption={value:string;label:string;disabled?:boolean};
export default function SelectMenu({label,value,options,onChange,media=false,onOpenChange}:{label:string;value:string;options:SelectOption[];onChange:(value:string)=>void;media?:boolean;onOpenChange?:(open:boolean)=>void}){
 const id=useId(),button=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState<CSSProperties>({visibility:'hidden'});
 const latest=useRef({open,options,onChange,onOpenChange});latest.current={open,options,onChange,onOpenChange};
 function close(focus=false){setOpen(false);latest.current.onOpenChange?.(false);if(focus)button.current?.focus({preventScroll:true});}
 function show(){document.dispatchEvent(new CustomEvent('hongguo-select-open',{detail:id}));setActive(Math.max(0,options.findIndex(x=>x.value===value)));setOpen(true);latest.current.onOpenChange?.(true);}
 function choose(index:number){const option=latest.current.options[index];if(option&&!option.disabled){latest.current.onChange(option.value);close(true);}}
 useLayoutEffect(()=>{
  if(!open)return;
  const b=button.current!.getBoundingClientRect(),width=Math.min(Math.max(b.width,media?168:190),innerWidth-24),wanted=Math.min(320,options.length*38+16),below=innerHeight-b.bottom-16,above=b.top-16,up=below<wanted&&above>below;
  setPosition({width,left:Math.max(12,Math.min(b.left,innerWidth-width-12)),maxHeight:Math.max(72,Math.min(wanted,up?above:below)),...(up?{bottom:innerHeight-b.top+6,top:'auto'}:{top:b.bottom+6,bottom:'auto'}),visibility:'visible'});
 },[open,options.length]);
 useEffect(()=>{if(open)popup.current?.querySelector<HTMLElement>('[data-active=true]')?.scrollIntoView({block:'nearest'});},[active,open]);
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(latest.current.open&&!button.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node))close();};
  const other=(e:Event)=>{if((e as CustomEvent).detail!==id&&latest.current.open)close();};
  const scroll=(e:Event)=>{if(latest.current.open&&!popup.current?.contains(e.target as Node))close();};
  const resize=()=>{if(latest.current.open)close();};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('hongguo-select-open',other);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',resize);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('hongguo-select-open',other);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',resize);latest.current.onOpenChange?.(false);};
 },[id]);
 useEffect(()=>{
  if(!open)return;
  function key(e:KeyboardEvent){if(e.key==='Tab'){close();return;}if(!['Escape','ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='Escape'){close(true);return;}if(e.key==='Enter'||e.key===' '){choose(active);return;}const indices=options.map((x,i)=>x.disabled?-1:i).filter(i=>i>=0),at=indices.indexOf(active);if(!indices.length)return;setActive(e.key==='Home'?indices[0]:e.key==='End'?indices.at(-1)!:indices[(at+(e.key==='ArrowDown'?1:-1)+indices.length)%indices.length]);}
  document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true);
 },[open,active,options]);
 const selected=options.find(x=>x.value===value);
 return <><button ref={button} type="button" className={'select-trigger '+(media?'media-select':'')} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} aria-activedescendant={open?id+'-'+active:undefined} data-value={value} data-options={JSON.stringify(options)} onClick={()=>open?close():show()} onKeyDown={e=>{if(!open&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();show();}}}><span>{selected?.label||value}</span><Icon name="down" size={13}/></button>{open&&createPortal(<div ref={popup} id={id} role="listbox" aria-label={label} className={'select-popover '+(media?'media-menu':'')} style={position} onWheel={e=>e.stopPropagation()}>{options.map((x,i)=><button type="button" role="option" tabIndex={-1} key={x.value} id={id+'-'+i} data-value={x.value} data-active={i===active} aria-selected={x.value===value} disabled={x.disabled} className={x.value===value?'selected':''} onPointerMove={()=>setActive(i)} onClick={()=>choose(i)}><span>{x.label}</span>{x.value===value&&<Icon name="check" size={14}/>}</button>)}</div>,document.body)}</>;
}
