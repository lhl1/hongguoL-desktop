import {useEffect,useRef,useState} from 'react';
import {unwrap} from './types';
import {Icon} from './ui';
export default function SearchBox({value,onChange,onSearch}:{value:string;onChange:(value:string)=>void;onSearch:(query:string)=>void}){
 const [focused,setFocused]=useState(false),[composing,setComposing]=useState(false),[words,setWords]=useState<string[]>([]),[index,setIndex]=useState(-1),[suppressed,setSuppressed]=useState(false);
 const sequence=useRef(0),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{const token=++sequence.current;setWords([]);setIndex(-1);if(!focused||composing||suppressed||!value.trim())return;const timer=setTimeout(()=>{void unwrap(window.hongguo.suggest(value)).then(data=>{if(token===sequence.current)setWords(data.items);}).catch(()=>{if(token===sequence.current)setWords([]);});},250);return()=>{sequence.current++;clearTimeout(timer);};},[value,focused,composing,suppressed]);
 const open=focused&&!suppressed&&words.length>0;
 function submit(query:string){sequence.current++;setSuppressed(true);setWords([]);onChange(query);onSearch(query);}
 return <form className="search-form" onSubmit={event=>{event.preventDefault();if(!composing)submit(index>=0&&open?words[index]:value);}} role="search" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setFocused(false);setSuppressed(false);}}}>
  <Icon name="search" size={18}/><label className="sr-only" htmlFor="query">搜索剧名</label>
  <input id="query" ref={input} value={value} onChange={event=>{onChange(event.target.value);setSuppressed(false);}} onFocus={()=>{setFocused(true);setSuppressed(false);}} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
   onKeyDown={event=>{if(composing||event.nativeEvent.isComposing)return;if(event.key==='Escape'){event.preventDefault();setSuppressed(true);setWords([]);}else if(open&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();setIndex(i=>event.key==='ArrowDown'?(i+1)%words.length:(i<=0?words.length-1:i-1));}else if(event.key==='Enter'&&open&&index>=0){event.preventDefault();submit(words[index]);}}}
   placeholder="搜索剧名或关键词" maxLength={100} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="search-suggestions" aria-activedescendant={open&&index>=0?'suggestion-'+index:undefined}/>
  <button type="submit">搜索</button>
  {open&&<div className="search-suggestions" id="search-suggestions" role="listbox" aria-label="搜索联想">{words.map((word,i)=><button type="button" key={word} id={'suggestion-'+i} role="option" aria-selected={i===index} onPointerDown={event=>event.preventDefault()} onClick={()=>submit(word)}><Icon name="search" size={14}/><span>{word}</span></button>)}</div>}
 </form>;
}
