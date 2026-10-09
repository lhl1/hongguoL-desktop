import {rpc} from './apk-rpc.mjs';
import {id,series} from './apk-models.mjs';

// APK hy4.t + BookGroup/BookRelatedAlbumStruct. These are field names, not object names.
export const SERIES_FIELDS=['series_id_str','series_title','series_cover','series_intro','episode_cnt','album_id','album_serial_count','album_series_ids','series_in_album_order'];
const books=new Map(),batches=new Map(),families=new Map(),resolving=new Map();
const TTL=180000;
let generation=0;
export function clearFamilies(){generation++;books.clear();batches.clear();families.clear();resolving.clear();}
function remember(map,key,value,max=400){if(map.size>=max&&!map.has(key))map.delete(map.keys().next().value);map.set(key,{value,at:Date.now()});}
function cached(map,key){const old=map.get(key);return old&&Date.now()-old.at<TTL?old.value:undefined;}
function validId(value){try{return id(typeof value==='number'&&Number.isSafeInteger(value)?String(value):value);}catch{return '';}}
export function bookMetadata(seriesId,group){
 const base=group?.base_info,album=group?.album_info;
 let item;try{item=series({...base,series_id_str:base?.series_id_str||seriesId});if(item.id!==seriesId||!item.title)item=undefined;}catch{}
 const albumId=validId(album?.album_id_str||album?.album_id);
 const members=[...new Set((Array.isArray(album?.album_series_ids)?album.album_series_ids:[]).slice(0,200).map(validId).filter(Boolean))];
 // Unrelated or malformed server data cannot absorb the requested work into a family.
 const related=members.length>1&&members.includes(seriesId);
 return {item,albumId:related?albumId:'',members:related?members:[],order:related?Math.max(0,Number(album?.series_in_album_order)||0):0};
}
async function metadata(ids){
 const token=generation,result=new Map(ids.map(x=>[x,cached(books,x)])),missing=ids.filter(x=>!result.get(x));
 for(let offset=0;offset<missing.length;offset+=100){
  const part=missing.slice(offset,offset+100),key=[...part].sort().join(',');
  let call=batches.get(key);
  if(!call){call=(async()=>{
   const raw=await rpc('bookFields',{book_pack_channel:'select_panel_series',req_ids:part.map(BigInt),req_fields:SERIES_FIELDS});
   if(!raw.data||typeof raw.data!=='object'||Array.isArray(raw.data))throw new Error('原版系列信息格式无效');
   const result=new Map(part.map(seriesId=>[seriesId,bookMetadata(seriesId,raw.data[seriesId])]));
   if(token===generation)for(const [key,value] of result)remember(books,key,value);
   return result;
  })().finally(()=>{if(batches.get(key)===call)batches.delete(key);});batches.set(key,call);}
  const values=await call;for(const [key,value] of values)result.set(key,value);
  if(token!==generation)throw new Error('系列会话已更新，请重试');
 }
 return result;
}
const familyTitle=item=>item.title.replace(/\s*(?:第[零〇一二三四五六七八九十百\d]+[季部]|[Ss]eason\s*\d+|[Ss]\d+)\s*$/,'').trim()||item.title;
async function resolveFamily(info){
 const key=info.albumId||info.members[0],token=generation,old=cached(families,key);if(old)return structuredClone(old);
 let call=resolving.get(key);
 if(!call){call=(async()=>{
  const members=await metadata(info.members);
  const items=info.members.map((member,index)=>{
   const data=members.get(member);return data?.item?{...data.item,familyId:key,season:index+1}:undefined;
  }).filter(Boolean);
  if(items.length<2)throw new Error('系列成员暂不完整，请稍后重试');
  const value={id:key,title:familyTitle(items[0]),items,total:info.members.length};
  if(token===generation)remember(families,key,value,100);
  return value;
 })().finally(()=>{if(resolving.get(key)===call)resolving.delete(key);});resolving.set(key,call);}
 return structuredClone(await call);
}
export async function seriesGroups(values){
 if(!Array.isArray(values)||!values.length||values.length>100)throw new Error('系列查询需包含 1 至 100 个剧目');
 const ids=[...new Set(values.map(id))],token=generation,meta=await metadata(ids);
 const groups=new Map();
 for(const info of meta.values())if(info?.members.length){const key=info.albumId||info.members[0];if(!groups.has(key))groups.set(key,info);}
 const outcomes=await Promise.allSettled([...groups.values()].map(resolveFamily));
 if(token!==generation)throw new Error('系列会话已更新，请重试');
 return {families:outcomes.filter(x=>x.status==='fulfilled').map(x=>x.value),unavailable:outcomes.filter(x=>x.status==='rejected').length};
}
export async function family(seriesId){
 id(seriesId);const result=await seriesGroups([seriesId]);
 if(result.unavailable)throw new Error('系列成员暂未加载完成，请重试');
 return result.families.find(x=>x.items.some(s=>s.id===seriesId))||null;
}
