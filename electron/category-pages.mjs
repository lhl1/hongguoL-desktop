import {randomBytes} from 'node:crypto';
import {rpc} from './apk-rpc.mjs';
import {cells,id} from './apk-models.mjs';
import {filterRows,validateFilterMap,reconcileFilterMap,filterMapKey} from './category-filter-model.mjs';
const contexts=new Map();
function save(value){if(contexts.size>=100)contexts.delete(contexts.keys().next().value);const key=randomBytes(20).toString('hex');contexts.set(key,{...value,at:Date.now()});return key;}
function read(key,kind){const value=contexts.get(key);if(!value||value.kind!==kind||Date.now()-value.at>1800000)throw new Error('筛选会话已过期，请刷新');return value;}
export function clearCategories(){contexts.clear();}
export async function filterCatalog(selection={},cursor=''){
 if(!selection||typeof selection!=='object'||Array.isArray(selection)||Object.keys(selection).some(k=>!['context','selectItems'].includes(k)))throw new Error('分类筛选无效');
 let meta;
 if(cursor){meta=read(cursor,'category-page');const old=selection.context?read(selection.context,'filter'):meta;if(filterMapKey(old.selected)!==filterMapKey(meta.selected)||selection.selectItems!==undefined&&filterMapKey(validateFilterMap(selection.selectItems,meta.rows))!==filterMapKey(meta.selected))throw new Error('分类筛选与游标不一致');}
 else if(selection.context){const old=read(selection.context,'filter');meta={...old,offset:0,selected:validateFilterMap(selection.selectItems??old.selected,old.rows)};}
 else{if(selection.selectItems&&Object.keys(selection.selectItems).length)throw new Error('请先获取原版筛选选项');meta={selected:{},offset:0};}
 // APK rpc.e$a / GetCategoryLandpageRequest: row-type -> selected ID array.
 const request=async(state,kind)=>(await rpc('categoryFilter',{need_selector_panel:!cursor,select_items:state.selected,client_req_type:kind,offset:state.offset,limit:12,session_id:state.sessionId})).data;
 let d=await request(meta,cursor?2:selection.context?4:3);
 if(!d||!Array.isArray(d.video_data)||(!cursor&&!Array.isArray(d.selector_rows)))throw new Error('原版筛选返回格式暂不支持');
 let rows=d.selector_rows?filterRows(d.selector_rows):meta.rows,selected=reconcileFilterMap(meta.selected,rows);
 // Refreshing the genre can remove options. Requery the reconciled combination before presenting its results.
 if(!cursor&&filterMapKey(selected)!==filterMapKey(meta.selected)){meta={...meta,selected,sessionId:d.session_id||meta.sessionId};d=await request(meta,4);if(!d||!Array.isArray(d.video_data))throw new Error('原版筛选返回格式暂不支持');rows=d.selector_rows?filterRows(d.selector_rows):rows;selected=reconcileFilterMap(selected,rows);}
 const items=cells([{video_data:d.video_data}]),offset=Number(d.next_offset)||0,maxExpand=Number.isSafeInteger(Number(d.max_expand_num))?Math.max(0,Number(d.max_expand_num)):meta.maxExpand||0;
 const next={...meta,rows,selected,offset,maxExpand,sessionId:d.session_id||meta.sessionId},more=d.has_more===true&&items.length>0&&offset>meta.offset;
 return{items,filters:[],rows,selectedFilters:selected,maxExpand,filterContext:save({...next,kind:'filter'}),hasMore:more,cursor:more?save({...next,kind:'category-page'}):''};
}
export async function actorWorks(actorId,cursor=''){
 id(actorId);const meta=cursor?read(cursor,'actor-page'):{actorId,offset:0};if(meta.actorId!==actorId)throw new Error('演员与游标不一致');
 const d=(await rpc('celebrityWorks',{encrypted_celebrity_ids:actorId,count:20,offset:meta.offset,req_scene:0})).data?.works?.[actorId];if(!d)throw new Error('原版演员作品返回格式暂不支持');
 const items=cells([{video_data:d.video_list||[]}]),offset=meta.offset+items.length,more=d.has_more===true&&items.length>0;return{items,filters:[],hasMore:more,cursor:more?save({kind:'actor-page',actorId,offset}):''};
}
