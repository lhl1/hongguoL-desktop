import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as provider from '../electron/provider.mjs';
import {suggestionWords,clearSearch} from '../electron/search-pages.mjs';
import {createWindowControls} from '../electron/window-controls.mjs';
import {animateFrames} from '../src/video-transition.mjs';
import {isCurrentMediaError} from '../src/media-events.mjs';
const card=n=>({series_id_str:String(7000000000000000000n+BigInt(n)),series_title:'测试'+n,episode_total_cnt:80});
test('search uses advancing APK offsets/session/passback; cursors bind query and expire on account change',async()=>{
 const calls=[];provider.configureFetch(async address=>{const u=new URL(address);calls.push(u);const offset=Number(u.searchParams.get('offset'));return new Response(JSON.stringify({code:0,search_tabs:[{tab_type:11,data:[{video_series_list:[card(offset+1)]}],has_more:true,next_offset:offset<40?offset+20:offset,search_id:'synthetic-context',passback:'synthetic-passback'}]}));});
 const first=await provider.search('测试');assert.equal(first.items.length,1);assert.match(first.cursor,/^[a-f0-9]{40}$/);assert.equal(first.searchId,undefined);
 const second=await provider.search('测试',first.cursor);assert.notEqual(first.items[0].id,second.items[0].id);assert.equal(calls[1].searchParams.get('offset'),'20');assert.equal(calls[1].searchParams.get('search_id'),'synthetic-context');assert.equal(calls[1].searchParams.get('passback'),'synthetic-passback');assert.equal(calls[1].pathname,'/reading/bookapi/search/tab/v');
 await assert.rejects(provider.search('其他',second.cursor),/会话/);const third=await provider.search('测试',second.cursor);assert.equal(third.hasMore,false);assert.equal(third.cursor,'');clearSearch();await assert.rejects(provider.search('测试',first.cursor),/会话/);
});
test('suggestion parsing bounds strings and strips markup; provider sends APK q and caches repeated lookups',async()=>{
 const raw={code:0,data:{query_result:['测试','测试',null],query_result_v2:[{keyword:'<em>新剧</em>'},{name:'其他剧'},{keyword:'7000000000000000000',display_words:['最后','剧']},{keyword:'7000000000000000001'}]}};
 assert.deepEqual(suggestionWords(raw),['测试','新剧','其他剧','最后剧']);let count=0;
 provider.configureFetch(async address=>{count++;const u=new URL(address);assert.equal(u.pathname,'/reading/bookapi/search/suggest/v');assert.equal(u.searchParams.get('q'),'测试');assert.equal(u.searchParams.get('tab_type'),'11');return new Response(JSON.stringify(raw));});
 assert.equal((await provider.suggest('测试')).items.length,4);await provider.suggest('测试');assert.equal(count,1);await assert.rejects(provider.suggest(''),/请输入/);
});
test('production window buttons call native minimize, maximize, restore and close; immersive state restores',()=>{
 const calls=[];let max=false,full=false;const w={isDestroyed:()=>false,isMaximized:()=>max,isFullScreen:()=>full,minimize:()=>calls.push('minimize'),maximize:()=>{max=true;calls.push('maximize');},unmaximize:()=>{max=false;calls.push('restore');},close:()=>calls.push('close'),setFullScreen:v=>{full=v;calls.push('full:'+v);}};
 const c=createWindowControls(()=>w);c.control('minimize');assert.equal(c.control('maximize').maximized,true);assert.equal(c.control('maximize').maximized,false);assert.equal(c.control('window').mode,'window');assert.equal(c.control('window').mode,'normal');c.control('fullscreen');c.control('normal');c.control('close');assert.deepEqual(calls,['minimize','maximize','restore','full:true','full:false','close']);assert.throws(()=>c.control('bogus'));
 const hidden=createWindowControls(()=>w,{hidden:true});calls.length=0;for(const action of ['minimize','maximize','maximize','fullscreen','normal','close'])hidden.control(action);assert.equal(calls.length,0);assert.deepEqual(hidden.audit(),['minimize','maximize','maximize','fullscreen','normal','close']);assert.equal(hidden.state().closed,true);
});
test('gesture transition starts synchronously before target decoding, pairs directions and honors reduced motion',async()=>{
 const calls=[];const node={animate:(frames,options)=>{const a={finished:Promise.resolve(),play:()=>calls.push('play'),cancel:()=>calls.push('cancel')};calls.push({frames,options});return a;}};
 const forward=animateFrames(node,node,1);forward.ready();await forward.finished;assert.equal(calls[0].options.duration,620);assert.equal(calls[0].frames[1].transform,'translateY(-100%)');assert.equal(calls[1].frames[0].transform,'translateY(100%)');forward.cancel();assert.equal(calls.filter(x=>x==='cancel').length,2);
 calls.length=0;await animateFrames(node,node,-1,true).finished;assert.equal(calls.length,0);
});
test('slow target never pauses the transition; decoding cannot rewind or restart it',async()=>{
 const calls=[],animations=[];const node={animate:()=>{let done;const a={finished:new Promise(resolve=>done=resolve),pause:()=>calls.push('pause'),play:()=>calls.push('play'),cancel:()=>{calls.push('cancel');done();}};animations.push(a);return a;}};
 const turn=animateFrames(node,node,-1);await new Promise(resolve=>setTimeout(resolve,180));assert.deepEqual(calls,[]);assert.equal(animations[0].currentTime,undefined);
 turn.ready();turn.ready();assert.deepEqual(calls,[]);turn.cancel();await turn.finished;assert.equal(calls.filter(x=>x==='cancel').length,2);
 calls.length=0;const cancelled=animateFrames(node,node,1);cancelled.cancel();await cancelled.finished;await new Promise(resolve=>setTimeout(resolve,150));assert.deepEqual(calls,['cancel','cancel']);
});
test('cancelled prefetch errors cannot cancel a seek or replacement request',()=>{
 const previous={serial:1,play:{url:'old-capability'}},replacement={serial:2,play:{url:'new-capability'}},pending={slot:1,serial:2},error={code:4};
 assert.equal(isCurrentMediaError(1,undefined,pending,1,'old-capability',error),false);
 assert.equal(isCurrentMediaError(1,previous,pending,1,'old-capability',error),false);
 assert.equal(isCurrentMediaError(1,replacement,pending,1,'old-capability',error),false);
 assert.equal(isCurrentMediaError(1,replacement,pending,2,'new-capability',null),false);
 assert.equal(isCurrentMediaError(1,replacement,pending,2,'new-capability',error),true);
 assert.equal(isCurrentMediaError(0,replacement,pending,2,'new-capability',error),false);
});
