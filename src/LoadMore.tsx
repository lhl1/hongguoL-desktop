import {useEffect,useRef} from 'react';
export default function LoadMore({hasMore,busy,error,onMore,automatic=true,className=''}:{hasMore:boolean;busy:boolean;error?:string;onMore:()=>void;automatic?:boolean;className?:string}){
 const sentinel=useRef<HTMLDivElement>(null),callback=useRef(onMore);callback.current=onMore;
 useEffect(()=>{const el=sentinel.current;if(!el||!hasMore||busy||error||!automatic)return;const observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting))callback.current();},{root:el.closest('.content'),rootMargin:'0px 0px 500px 0px'});observer.observe(el);return()=>observer.disconnect();},[hasMore,busy,error,automatic]);
 return <div className="load-more" ref={sentinel}>{error&&<p role="alert">{error}</p>}{hasMore?<button className={'secondary '+className} disabled={busy} onClick={onMore}>{busy?'正在加载…':error?'重试加载':'加载更多剧集'}</button>:<p className="subtle">已经看到全部结果</p>}</div>;
}
