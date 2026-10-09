import {randomBytes} from 'node:crypto';
import {rpc,isAccountAuthenticated} from './apk-rpc.mjs';
import {searchResult} from './apk-models.mjs';
const pages=new Map(),suggestions=new Map(),searches=new Map(),pendingSearch=new Map(),pendingSuggestions=new Map();
let generation=0;
export function clearSearch(){generation++;pages.clear();suggestions.clear();searches.clear();pendingSearch.clear();pendingSuggestions.clear();}
function queryText(value){if(typeof value!=='string'||!value.trim()||value.length>100)throw new Error('请输入 1 至 100 字的剧名');return value.trim();}
const common=()=>({count:20,tab_type:11,search_source:1,user_is_login:isAccountAuthenticated()?1:0,bookshelf_search_plan:4,bookstore_tab:16,tab_name:'feed',client_ab_info:{middle_style_from_video:false,result_style_from_video:false}});
export async function search(query,cursor=''){
 query=queryText(query);const key=JSON.stringify([isAccountAuthenticated(),query,cursor]),token=generation;
 const old=!cursor&&searches.get(key);if(old&&Date.now()-old.at<60000)return structuredClone(old.value);
 let call=pendingSearch.get(key);
 if(!call){call=searchPage(query,cursor,token).then(value=>{
  if(token!==generation)throw new Error('搜索会话已更新，请重新搜索');
  if(!cursor){if(searches.size>=20)searches.delete(searches.keys().next().value);searches.set(key,{value,at:Date.now()});}
  return value;
 }).finally(()=>{if(pendingSearch.get(key)===call)pendingSearch.delete(key);});pendingSearch.set(key,call);}
 return structuredClone(await call);
}
async function searchPage(query,cursor,token){
 query=queryText(query);let previous;
 if(cursor){previous=pages.get(cursor);if(!previous||previous.query!==query||Date.now()-previous.at>1800000)throw new Error('搜索会话已过期，请重新搜索');}
 const offset=previous?.offset||0;
 const raw=await rpc('search',{...common(),query,offset,only_feed:false,search_source_id:'clks###',use_correct:false,use_lynx:false,is_first_enter_search:false,...(previous?{search_id:previous.searchId,passback:previous.passback}:{})});
 const data=searchResult(raw,query),hasMore=!!data.hasMore&&Number.isSafeInteger(data.nextOffset)&&data.nextOffset>offset;
 if(token!==generation)throw new Error('搜索会话已更新，请重新搜索');
 let next='';
 if(hasMore){if(pages.size>=100)pages.delete(pages.keys().next().value);next=randomBytes(20).toString('hex');pages.set(next,{query,offset:data.nextOffset,searchId:data.searchId||previous?.searchId||'',passback:data.passback||previous?.passback||'',at:Date.now()});}
 // Server session/passback stay in the main process; only an opaque capability crosses IPC.
 return {query,items:data.items,total:data.total,hasMore,cursor:next};
}
export function suggestionWords(response){
 const data=response.data;if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('原版联想响应格式无效');
 const plain=Array.isArray(data.query_result)?data.query_result:[];
 const rich=Array.isArray(data.query_result_v2)?data.query_result_v2:[];
 // Rich-card keyword can be a numeric series identifier, not the text presented to users.
 const candidates=[...plain,...rich.slice(0,30).map(x=>x.display_words?.join('')||x.book_name||x.video_data?.series_title||x.video_data?.title||x.name||x.keyword)];
 const words=candidates.filter(x=>typeof x==='string').map(x=>x.replace(/<[^>]*>/g,'').trim().slice(0,100)).filter(x=>x&&!/^\d{5,}$/.test(x));
 return [...new Set(words)].slice(0,12);
}
export async function suggest(query){
 query=queryText(query);const key=(isAccountAuthenticated()?'account:':'guest:')+query;
 const cached=suggestions.get(key);if(cached&&Date.now()-cached.at<60000)return{query,items:[...cached.items]};
 const token=generation;let call=pendingSuggestions.get(key);
 if(!call){call=(async()=>{const items=suggestionWords(await rpc('suggest',{...common(),q:query,need_preload:false}));
  if(token!==generation)throw new Error('搜索会话已更新，请重试');
  if(suggestions.size>=40)suggestions.delete(suggestions.keys().next().value);suggestions.set(key,{items,at:Date.now()});return{query,items};
 })().finally(()=>{if(pendingSuggestions.get(key)===call)pendingSuggestions.delete(key);});pendingSuggestions.set(key,call);}
 return structuredClone(await call);
}
