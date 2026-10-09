// SelectorSelectionType (rank) differs from SelectionType (category).
export function toggleFilter(ids,row,item,source='rank'){
 const previous=ids.filter(Boolean),members=new Set(row.items.map(x=>x.id)),selected=previous.includes(item.id),multi=row.selectionType===1||(source==='rank'&&row.selectionType===4);
 const required=source==='rank'?row.selectionType===3||row.selectionType===4:row.selectionType===0;
 let remaining=previous.filter(id=>!members.has(id));
 if(!item.id)return remaining;
 if(multi&&!item.exclusive){const within=previous.filter(id=>members.has(id)&&!row.items.find(x=>x.id===id)?.exclusive);if(selected){if(required&&within.length===1)return previous;within.splice(within.indexOf(item.id),1);}else{if(row.limit>0&&within.length>=row.limit)return previous;within.push(item.id);}return[...remaining,...within];}
 if(selected&&!required)return remaining;
 return[...remaining,item.id];
}
