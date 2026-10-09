import {selectorRows} from './catalog-selectors.mjs';
export function filterRows(raw){
 if(!Array.isArray(raw)||!raw.length)throw new Error('原版筛选返回格式暂不支持');
 const rows=selectorRows(raw,'rank');
 if(rows.some(r=>!r.type||!r.title||![1,2,3,4].includes(r.selectionType))||new Set(rows.map(r=>r.type)).size!==rows.length)throw new Error('原版筛选规则暂不支持');
 return rows;
}
export function validateFilterMap(value,rows){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!rows.some(r=>r.type===key)))throw new Error('筛选选项无效');
 const result={};
 for(const row of rows){
  const ids=value[row.type]??[];
  if(!Array.isArray(ids)||ids.length>300||ids.some(x=>typeof x!=='string'||!row.items.some(i=>i.id===x))||new Set(ids).size!==ids.length)throw new Error('筛选选项无效');
  if(([2,3].includes(row.selectionType)&&ids.length>1)||(row.limit>0&&ids.length>row.limit)||(ids.length>1&&row.items.some(x=>x.exclusive&&ids.includes(x.id))))throw new Error('超过原版筛选数量限制');
  if([3,4].includes(row.selectionType)&&!ids.length)throw new Error('原版筛选至少需要一项');
  if(ids.length)result[row.type]=[...ids].sort();
 }
 return result;
}
export function reconcileFilterMap(value,rows){
 const result={};
 for(const row of rows){const ids=(value[row.type]??row.items.filter(x=>x.selected).map(x=>x.id)).filter(id=>row.items.some(x=>x.id===id));
  if(ids.length)result[row.type]=ids;
  else if([3,4].includes(row.selectionType)){const defaults=row.items.filter(x=>x.selected).map(x=>x.id);if(defaults.length)result[row.type]=defaults;else if(row.items.length)result[row.type]=[row.items[0].id];}
 }
 return validateFilterMap(result,rows);
}
export function filterMapKey(value){return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([,v])=>v.length).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,[...v].sort()])));}
