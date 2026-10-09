import {randomUUID,randomBytes} from 'node:crypto';
import {rpc} from './apk-rpc.mjs';
import {cells,homeResult} from './apk-models.mjs';
import {rankSelectors,validateSelection} from './catalog-selectors.mjs';
import {safeImage,id} from './apk-models.mjs';
const pages=new Map();
const cleanItems=v=>cells(v);
function keep(value){if(pages.size>=100)pages.delete(pages.keys().next().value);const key=randomBytes(20).toString('hex');pages.set(key,{...value,at:Date.now()});return key;}
function read(key){const v=pages.get(key);if(!v||Date.now()-v.at>1800000)throw new Error('列表会话已过期，请刷新');return v;}
export function clearPages(){pages.clear();}
function actors(c){return(c.cell_data||[]).flatMap(x=>x.ugc_user_data||[]).flatMap(x=>{const b=x.user_info?.base_info;if(!b?.actor_id_str&&!b?.actor_id)return[];try{return[{id:id(b.actor_id_str||b.actor_id),name:String(b.user_name||'演员').slice(0,80),cover:safeImage(String(b.user_avatar||'').replace(/^http:/,'https:')),intro:String(x.intro||'').slice(0,3000),tags:(x.sub_title_list||[]).map(t=>String(t.content||'').slice(0,80)),metric:String(x.rec_text_item?.RecommendText||'').slice(0,100)}];}catch{return[];}});}
function page(c,meta,initial=false){const items=cleanItems([c]),actorItems=actors(c);const offset=Number(c.next_offset??meta.offset??items.length+actorItems.length);const more=initial&&meta.kind==='feed'?true:c.has_more===true;return{items,actors:actorItems,hasMore:more,cursor:more?keep({...meta,cellId:c.cell_id_str||c.cell_id||meta.cellId,offset,sessionId:c.session_id||meta.sessionId,rankVersion:c.rank_version||meta.rankVersion}):'',filters:rankSelectors(c.cell_selector)};}
export async function feed(category='推荐',cursor=''){
 if(cursor)return more(cursor,'feed');
 const tabs={'推荐':16,'漫剧':36,'真人剧':39};if(!Object.hasOwn(tabs,category))throw new Error('首页栏目无效');
 const uuid=randomUUID();const raw=await rpc('tabs',{tab_type:tabs[category],offset:0,bottom_tab_type:7,client_req_type:3,screen_width_px:'1280',session_uuid:uuid,enable_search_box_collapse:false});
 const tab=raw.data?.tab_item?.find(x=>Number(x.tab_type)===tabs[category]);const c=tab?.cell_data?.find(x=>cleanItems([x]).length);
 if(!c){const h=homeResult(raw);return{items:h.banners,hasMore:false,cursor:'',filters:[]};}
 return page(c,{kind:'feed',tabType:tabs[category],uuid,sessionId:tab.session_id,offset:cleanItems([c]).length},true);
}
const selectionKeys=['selected_items','sub_selected_items','panel_selected_items','background_selected_items'];
export async function rankings(selection={},cursor=''){
 selection=validateSelection(selection,selectionKeys);
 if(cursor){const m=read(cursor);if(Object.keys(selection).length&&JSON.stringify(selection)!==JSON.stringify(m.selection))throw new Error('榜单筛选与游标不一致');return more(cursor,'rank');}
 const uuid=randomUUID();const raw=await rpc('plan',{scene:10,from:'video_ranklist',bookstore_tab_type:26,session_uuid:uuid,...selection});
 const c=raw.data?.find(x=>x.cell_selector)||raw.data?.[0];if(!c)throw new Error('榜单返回格式暂不支持');
 return page(c,{kind:'rank',tabType:26,uuid,selection,sessionId:c.session_id},true);
}
async function more(cursor,kind){const m=read(cursor);if(m.kind!==kind)throw new Error('列表游标无效');const raw=await rpc('cell',{cell_id:m.cellId,offset:m.offset,limit:20,tab_type:m.tabType,session_id:m.sessionId,session_uuid:m.uuid,rank_version:m.rankVersion,client_req_type:2,client_template:kind==='feed'?7:2,...m.selection});const d=raw.data;if(!d?.cell_view)throw new Error('列表续页格式暂不支持');const result=page({...d.cell_view,has_more:d.has_more,next_offset:d.next_offset,session_id:d.session_id,rank_version:d.rank_version},m);if(!(result.items.length+result.actors.length)||Number(d.next_offset)<=m.offset)return{...result,hasMore:false,cursor:''};return result;}
