import { useEffect, useRef, useState } from 'react';
import { unwrap } from './types';
const paths: Record<string, string> = {
 check:'m5 12 4 4 10-10',lock:'M6 10h12v11H6V10M8 10V6a4 4 0 0 1 8 0v4',
 episodes:'M4 5h16M4 12h16M4 19h10',
 explore:'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20M16 8l-2 6-6 2 2-6 6-2',new:'M12 3v18M3 12h18',filter:'M4 5h16M7 12h10M10 19h4',rank:'M4 20h16M5 20v-7h4v7M10 20V4h4v16M15 20V9h4v11',home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',heart:'M20.8 4.6c-2-2-5.1-1.6-6.8.3L12 7l-2-2.1c-1.7-1.9-4.8-2.3-6.8-.3C1 6.8 1.5 10 3.7 12.2L12 21l8.3-8.8c2.2-2.2 2.7-5.4.5-7.6',history:'M3 3v6h6M3.5 8a9 9 0 1 1-.5 7M12 7v5l3 2',settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M9 2h6l.5 3 2 1.2L20 5l3 5-2.4 1.8v2.4L23 16l-3 5-2.5-1.2-2 1.2-.5 3H9l-.5-3-2-1.2L4 21l-3-5 2.4-1.8v-2.4L1 10l3-5 2.5 1.2 2-1.2L9 2',user:'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M4 21v-2a8 8 0 0 1 16 0v2',back:'m15 5-7 7 7 7',up:'m6 15 6-6 6 6',down:'m6 9 6 6 6-6',play:'m8 4 12 8-12 8V4',pause:'M8 4v16M16 4v16',next:'m5 4 11 8-11 8V4M20 4v16',fullscreen:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',window:'M3 5h18v14H3V5M3 9h18',sound:'m3 9 5 0 5-5v16l-5-5H3V9M17 8a6 6 0 0 1 0 8',muted:'m3 9 5 0 5-5v16l-5-5H3V9M17 9l5 6M22 9l-5 6',sync:'M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5',close:'m6 6 12 12M18 6 6 18'
};
export function Icon({name,size=20}: {name:string;size?:number}) {return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.play}/></svg>;}
export const imageURL=(source:string)=>source?`app://desktop/image?src=${encodeURIComponent(source)}`:'';
export function Cover({source,title,seriesId,className=''}: {source:string;title:string;seriesId?:string;className?:string}) {
  const [failed,setFailed]=useState(false),[resolved,setResolved]=useState(source);const generation=useRef(0),attempted=useRef(false);
  useEffect(()=>{generation.current++;attempted.current=false;setResolved(source);setFailed(false);return()=>{generation.current++;};},[source,seriesId]);
  async function refresh() {setFailed(true);if(!seriesId||attempted.current)return;attempted.current=true;const current=generation.current;try{const detail=await unwrap(window.hongguo.detail(seriesId));if(current===generation.current&&detail.cover&&detail.cover!==resolved){setResolved(detail.cover);setFailed(false);}}catch{/* Keep the clear fallback when the original image is unavailable. */}}
  return <div className={`cover-image ${className}`}>{resolved&&!failed?<img src={imageURL(resolved)} alt={title} loading="lazy" onError={()=>void refresh()}/>:<div className="cover-fallback"><Icon name="play" size={32}/><span>{title}</span></div>}</div>;
}
