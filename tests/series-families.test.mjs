import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as provider from '../electron/provider.mjs';
import {configureRequestEnricher,parseAPKJSON} from '../electron/apk-rpc.mjs';
import {bookMetadata,SERIES_FIELDS} from '../electron/series-families.mjs';
import {clearSearch} from '../electron/search-pages.mjs';
const first='7000000000000000101',second='7000000000000000102',third='7000000000000000103',album='7000000000000000200';
const group=(s,title,members=[first,second],a=album)=>({base_info:{series_id_str:s,series_title:title,episode_cnt:80},album_info:{album_id:a,album_series_ids:members}});
const response=data=>new Response(JSON.stringify({code:0,data}));
configureRequestEnricher(async request=>request);
test('APK member parsing never merges similarly named works or unsafe numeric IDs',()=>{
 assert.equal(bookMetadata(first,group(first,'同名剧',[second,third])).members.length,0);
 assert.equal(bookMetadata(first,group(first,'同名剧',[first,first,second,'bad'])).members.length,2);
 assert.equal(bookMetadata(first,group(first,'同名剧',[first,7000000000000000102])).members.length,0);
 assert.equal(bookMetadata(first,{base_info:{series_id_str:second,series_title:'同名剧'}}).item,undefined);
});
test('batch contract uses exact int64 POST, fills missing seasons and preserves original order; shared family cache is immutable',async()=>{
 const calls=[];
 provider.configureFetch(async (address,options)=>{
  const u=new URL(address);assert.equal(u.pathname,'/reading/distribution/book_pack_fields/select_panel_series/v1');assert.equal(options.method,'POST');
  assert.ok(options.body.includes(first)||options.body.includes(second));assert.ok(!options.body.includes('"'+first+'"'));
  const request=parseAPKJSON(options.body);assert.deepEqual(request.req_fields,SERIES_FIELDS);calls.push(request.req_ids);
  const data={};for(const s of request.req_ids)data[s]=group(s,s===first?'真实作品第一季':'真实作品第二季');return response(data);
 });
 const [a,b]=await Promise.all([provider.family(first),provider.family(first)]);assert.equal(calls.length,2);assert.equal(a.items.length,2);assert.deepEqual(a.items.map(x=>x.id),[first,second]);assert.equal(a.title,'真实作品');assert.equal(a.items[1].season,2);
 a.items[0].title='modified';assert.notEqual(b.items[0].title,'modified');assert.notEqual((await provider.family(second)).items[0].title,'modified');assert.equal(calls.length,2);
});
test('server-linked families group even without album ID; same titles without membership stay separate',async()=>{
 provider.configureFetch(async (_address,options)=>{const ids=parseAPKJSON(options.body).req_ids;return response(Object.fromEntries(ids.map(s=>[s,s===third?{base_info:{series_id_str:s,series_title:'同名第一季'}}:group(s,'同名'+(s===first?'第一季':'第二季'),[first,second],'0')])));});
 const data=await provider.seriesGroups([first,second,third]);assert.equal(data.families.length,1);assert.deepEqual(data.families[0].items.map(x=>x.id),[first,second]);assert.equal(await provider.family(third),null);
 await assert.rejects(provider.seriesGroups(Array(101).fill(first)),/100/);await assert.rejects(provider.family('invalid'),/编号/);
});
test('failed batch can retry and stale account request cannot populate a new family cache',async()=>{
 let calls=0;provider.configureFetch(async(_u,options)=>{if(++calls===1)return new Response(JSON.stringify({code:200001}));return response(Object.fromEntries(parseAPKJSON(options.body).req_ids.map(s=>[s,group(s,'测试')])));});
 await assert.rejects(provider.family(first));assert.equal((await provider.family(first)).items.length,2);
 let finish;provider.configureFetch(()=>new Promise(resolve=>finish=resolve));const pending=provider.family(first);await new Promise(r=>setImmediate(r));provider.invalidateCatalog();finish(response({[first]:group(first,'过期')}));await assert.rejects(pending,/更新/);
 provider.configureFetch(async(_u,options)=>response(Object.fromEntries(parseAPKJSON(options.body).req_ids.map(s=>[s,{base_info:{series_id_str:s,series_title:'新版独立剧'}}]))));assert.equal(await provider.family(first),null);
});
test('search and suggestion single-flight share requests, return independent snapshots and invalidate outstanding work',async()=>{
 let finish,count=0;provider.configureFetch(()=>{count++;return new Promise(resolve=>finish=resolve);});
 const a=provider.search('测试'),b=provider.search(' 测试 ');await new Promise(r=>setImmediate(r));assert.equal(count,1);
 finish(new Response(JSON.stringify({code:0,search_tabs:[{tab_type:11,data:[{video_series_list:[{series_id_str:first,series_title:'测试'}]}],has_more:false}]})));
 const [x,y]=await Promise.all([a,b]);x.items[0].title='corrupted';assert.equal(y.items[0].title,'测试');assert.equal((await provider.search('测试')).items[0].title,'测试');assert.equal(count,1);
 const hintsA=provider.suggest('测试'),hintsB=provider.suggest('测试');await new Promise(r=>setImmediate(r));assert.equal(count,2);finish(response({query_result:['测试']}));const [h1,h2]=await Promise.all([hintsA,hintsB]);h1.items[0]='bad';assert.equal(h2.items[0],'测试');
 const stale=provider.search('旧查询');await new Promise(r=>setImmediate(r));clearSearch();finish(new Response(JSON.stringify({code:0,search_tabs:[{tab_type:11,data:[],has_more:true,next_offset:20}]})));await assert.rejects(stale,/更新/);
 const staleHints=provider.suggest('旧联想');await new Promise(r=>setImmediate(r));clearSearch();finish(response({query_result:['旧联想']}));await assert.rejects(staleHints,/更新/);
});
