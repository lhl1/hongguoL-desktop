import {createContext,useContext,useEffect,useState} from 'react';
import type {ReactNode} from 'react';

export type CatalogLayout='grid'|'list';
const Context=createContext<{layout:CatalogLayout;setLayout:(v:CatalogLayout)=>void}>({layout:'grid',setLayout:()=>{}});
export function CatalogLayoutProvider({defaultLayout='grid',children}:{defaultLayout?:CatalogLayout;children:ReactNode}){
 const [layout,setLayout]=useState<CatalogLayout>(defaultLayout);
 useEffect(()=>setLayout(defaultLayout),[defaultLayout]);
 return <Context.Provider value={{layout,setLayout}}>{children}</Context.Provider>;
}
export function CatalogViewSwitch(){
 const {layout,setLayout}=useContext(Context);
 return <div className="catalog-view-switch" role="group" aria-label="剧集排列">
  {(['grid','list'] as const).map(value=><button key={value} type="button" aria-label={value==='grid'?'卡片排列':'列表排列'} title={value==='grid'?'卡片排列':'一行一部剧'} aria-pressed={layout===value} onClick={()=>setLayout(value)}>
   <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{value==='grid'?<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>:<path d="M4 5h3v3H4zM11 6.5h9M4 11h3v3H4zM11 12.5h9M4 17h3v3H4zM11 18.5h9"/>}</svg>
  </button>)}
 </div>;
}
export function CatalogGrid({children,rank=false}:{children:ReactNode;rank?:boolean}){
 const {layout}=useContext(Context);
 return <div className={(rank?'rank-grid':'card-grid')+' catalog-grid'} data-layout={layout}>{children}</div>;
}
