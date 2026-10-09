import {test} from 'node:test';import assert from 'node:assert/strict';
import {rankSelectors,selectorRows} from '../electron/catalog-selectors.mjs';
import {toggleFilter} from '../src/filter-selection.mjs';
import {series} from '../electron/apk-models.mjs';
import {filterCatalog,actorWorks,clearCategories} from '../electron/category-pages.mjs';
import {configureFetch,configureContext,configureRequestEnricher} from '../electron/apk-rpc.mjs';
const row=(type=1,limit=2)=>({title:'类型',selectionType:type,limit,items:[{id:'a'},{id:'b'},{id:'c'},{id:'all',exclusive:true}]});
test('rank and category use distinct selector enums, bounded multi-select and mutually-exclusive defaults',()=>{
 assert.deepEqual(toggleFilter(['a'],row(),{id:'b'}),['a','b']);assert.deepEqual(toggleFilter(['a','b'],row(),{id:'c'}),['a','b']);assert.deepEqual(toggleFilter(['a','b'],row(),{id:'all',exclusive:true}),['all']);assert.deepEqual(toggleFilter(['all'],row(),{id:'a'}),['a']);assert.deepEqual(toggleFilter(['a'],row(4),{id:'a'}),['a']);assert.deepEqual(toggleFilter(['a'],row(3),{id:'a'}),['a']);assert.deepEqual(toggleFilter(['a'],row(2),{id:'a'}),[]);assert.deepEqual(toggleFilter(['a'],row(0),{id:'a'},'category'),['a']);assert.deepEqual(toggleFilter(['a'],row(2),{id:'b'},'category'),['b']);
});
test('original rank metadata keeps actors, albums, background selectors and empty-ID total option',()=>{
 const raw={outer_row:{items:[{selector_item_id:'ranklist_celebrity',show_name:'演员'},{selector_item_id:'series_album',show_name:'系列剧',background_selector:{inner_rows:[{row_name:'范围',selection_type:3,items:[{selector_item_id:'',show_name:'总榜',is_selected:true}]}]}}]}};
 const parsed=rankSelectors(raw);assert.equal(parsed.length,2);assert.equal(parsed[1].background[0].items[0].title,'总榜');assert.equal(parsed[1].background[0].items[0].id,'');assert.equal(parsed[1].background[0].selectionType,3);
});
test('reservation metadata marks unavailable main series, zero-count released actor works are not mistaken for reservations',()=>{
 assert.equal(series({series_id:'123456',title:'待上线',episode_cnt:0,subscribe_item:{}}).availability,'upcoming');assert.equal(series({series_id:'123456',title:'在播',episode_cnt:0,disable_play:false}).availability,undefined);assert.equal(series({series_id:'123456',title:'在播',episode_cnt:30,subscribe_item:{}}).availability,undefined);
});
test('actor works use original actor ID map and authoritative continuation, without inventing user search results',async()=>{
 clearCategories();configureFetch(async address=>{const u=new URL(address);assert.equal(u.pathname,'/reading/user/celebrity/works/v');assert.equal(u.searchParams.get('encrypted_celebrity_ids'),'123456');const offset=Number(u.searchParams.get('offset'));return new Response(JSON.stringify({code:0,data:{works:{'123456':{video_list:[{series_id:String(654321+offset),title:'演员作品'}],has_more:offset===0}}}}));});const first=await actorWorks('123456');assert.equal(first.items.length,1);const next=await actorWorks('123456',first.cursor);assert.equal(next.hasMore,false);assert.notEqual(next.items[0].id,first.items[0].id);await assert.rejects(actorWorks('222222',first.cursor),/游标/);
});
