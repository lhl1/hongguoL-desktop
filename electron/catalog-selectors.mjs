const text=(v,n=120)=>typeof v==='string'?v.slice(0,n):'';
export function selectorRows(rows=[],source='rank'){
 return rows.slice(0,30).map(r=>({title:text(r.row_name),type:text(r.type),selectionType:Number(r.selection_type??(source==='rank'?3:0)),limit:Math.max(0,Number(r.multi_selection_bound)||0),refreshOthers:!!r.refresh_other_selector_row,items:(r.items||[]).slice(0,300).map(x=>({id:text(x.selector_item_id,150),title:text(x.show_name),selected:source==='rank'?!!x.is_selected:!!x.is_default_selected,exclusive:!!x.mutually_exclusive_to_others,children:[],filters:[],...(x.sub_selector?{rows:selectorRows([x.sub_selector],source)}:{})}))}));
}
export function rankSelectors(s){
 function item(x){return{id:text(x.selector_item_id,150),title:text(x.show_name),selected:!!x.is_selected,description:text(x.sub_title,300),children:(x.sub_cell_selector?.outer_row?.items||[]).map(item),filters:selectorRows([...(x.panel_selector?.inner_rows||[]),...(x.panel_selector?.outer_row?[x.panel_selector.outer_row]:[])]),background:selectorRows([...(x.background_selector?.inner_rows||[]),...(x.background_selector?.outer_row?[x.background_selector.outer_row]:[])])};}
 return(s?.outer_row?.items||[]).map(item);
}
export function validateSelection(value,keys){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('筛选无效');for(const[k,v]of Object.entries(value))if(!keys.includes(k)||typeof v!=='string'||v.length>4000||!/^[\w,\-]*$/.test(v))throw new Error('筛选无效');return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));}
