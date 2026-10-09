import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWheelGate} from '../src/gesture.mjs';
import {selectNativeTrack,createMediaBroker} from '../electron/apk-media.mjs';
import {configureFetch,configureRequestEnricher,configureContext} from '../electron/apk-rpc.mjs';
import {feed,rankings,clearPages} from '../electron/catalog-pages.mjs';
test('one complete wheel burst switches once; fresh gestures and reverse work; drawer consumes its gesture',()=>{
 const gate=createWheelGate();assert.equal(gate(120,1000),1);
 for(let i=1;i<=30;i++)assert.equal(gate(120,1000+i*100),0);
 assert.equal(gate(-120,4500),-1);assert.equal(gate(120,5500,true),0);assert.equal(gate(120,5600),0);assert.equal(gate(120,6500),1);
 const trackpad=createWheelGate();assert.equal(trackpad(10,0),0);assert.equal(trackpad(10,10),0);assert.equal(trackpad(10,20),1);assert.equal(trackpad(10,30),0);
});
test('highest is the default; resolution choices use actual shorter edge and fall back down',()=>{
 const model={data:{video_model:JSON.stringify({video_duration:45,video_list:[360,720,1080].map(n=>({main_url:'https://v1.qznovelvod.com/test',video_meta:{vtype:'mp4',codec_type:'h264',vwidth:n,vheight:n*16/9}}))})}};
 assert.equal(selectNativeTrack(model).width,1080);assert.equal(selectNativeTrack(model,'720').width,720);assert.equal(selectNativeTrack(model,'480').width,360);assert.throws(()=>selectNativeTrack(model,'999'),/清晰度/);
 const broker=createMediaBroker('unused'),d={id:'123456',episodeList:[{number:1,videoId:'987654'}]};const p=broker.create(model,d,1,0);broker.release(p.url);return broker.stream(p.url.split('/').at(-1)).then(r=>assert.equal(r.status,410));
});
test('feed continuation retains APK cell/session/offset, rank filters reach server, cursor kinds cannot mix',async()=>{
 clearPages();configureContext({version:'',common:{}});configureRequestEnricher(async r=>r);
 const card=n=>({series_id:String(123450+n),title:'契约短剧'+n,episode_cnt:30});
 const calls=[];configureFetch(async(url)=>{const u=new URL(url);calls.push(u);let data;if(u.pathname.includes('/tab/'))data={tab_item:[{tab_type:16,title:'推荐',session_id:'generated-test-session',cell_data:[{cell_id:'654321',cell_data:[{video_data:[card(1),card(2),card(3)]}]}]}]};else if(u.pathname.includes('/plan/'))data=[{cell_id:'654320',cell_data:[{video_data:[card(4)]}],has_more:true,next_offset:10,session_id:'generated-rank-session',cell_selector:{outer_row:{items:[{show_name:'全部',selector_item_id:'all',is_selected:true}]}}}];else data={cell_view:{cell_id:u.searchParams.get('cell_id'),cell_data:[{video_data:[card(5)]}]},has_more:true,next_offset:20,session_id:'generated-next-session'};return new Response(JSON.stringify({code:0,data}));});
 const f=await feed();assert.equal(f.items.length,3);assert.equal(f.hasMore,true);await feed('推荐',f.cursor);assert.equal(calls[1].searchParams.get('offset'),'3');assert.equal(calls[1].searchParams.get('session_id'),'generated-test-session');
 await assert.rejects(rankings({},f.cursor),/游标/);const r=await rankings({selected_items:'human',sub_selected_items:'human_hot_play',panel_selected_items:'gender_female'});assert.equal(r.items.length,1);assert.equal(calls[2].searchParams.get('from'),'video_ranklist');assert.equal(calls[2].searchParams.get('scene'),'10');await rankings({},r.cursor);assert.equal(calls[3].searchParams.get('panel_selected_items'),'gender_female');
 await assert.rejects(rankings({selected_items:'../bad'}),/筛选/);
});
