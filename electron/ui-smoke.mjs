import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function runSmoke(window,folder){
 await fs.mkdir(folder,{recursive:true});
 const evaluate=code=>window.webContents.executeJavaScript(code,true),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const out={version:'2.3.3',hidden:true,muted:true,online:true,layouts:[],realLoginVerified:false,realCloudSyncVerified:false,nativeWindowTransitionsVerified:false};
 const shot=async name=>{assert.equal(window.isVisible(),false);await delay(180);await fs.writeFile(folder+'/'+name+'.png',(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
 async function until(code){const start=Date.now();while(Date.now()-start<70000){if(await evaluate(code))return;await delay(100);}await shot('timeout');throw new Error('Timeout: '+code);}
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 async function click(selector){const p=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');for(const type of ['mouseMoved','mousePressed','mouseReleased'])await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'?'none':'left',clickCount:type==='mouseMoved'?0:1});}
 const playing='document.querySelector(".active-video")?.currentTime>.3&&!document.querySelector(".active-video").paused';
 await until(playing);assert.equal(window.webContents.isAudioMuted(),true);out.playback=await evaluate('(()=>{const v=document.querySelector(".active-video");return{width:v.videoWidth,height:v.videoHeight,frames:v.webkitDecodedFrameCount,audio:v.webkitAudioDecodedByteCount};})()');
 for(const width of [780,1000,1440]){
  window.setSize(width,860);await delay(200);await evaluate('document.querySelector(".video-stage").dispatchEvent(new PointerEvent("pointermove",{bubbles:true}))');
  const fit=await evaluate('(()=>{const row=document.querySelector(".control-row"),r=row.getBoundingClientRect(),nodes=[...row.children].filter(e=>getComputedStyle(e).display!=="none");return{viewport:innerWidth,scroll:document.documentElement.scrollWidth,controlsFit:row.scrollWidth<=row.clientWidth,inside:nodes.every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1}),separate:nodes.every((e,i)=>!i||e.getBoundingClientRect().left>=nodes[i-1].getBoundingClientRect().right-1)};})()');
  assert.ok(fit.controlsFit&&fit.inside&&fit.separate,JSON.stringify(fit));out.layouts.push({width,player:fit});await shot('player-'+width);
 }
 window.setSize(1240,860);await click('[data-view="rankings"]');await until('document.querySelectorAll(".rank-card").length>=10&&document.querySelectorAll(".filter-choice").length>=4');
 for(const theme of ['light','dark']){
  await evaluate('window.hongguo.savePreferences({theme:'+JSON.stringify(theme)+'})');await until('document.documentElement.dataset.theme==='+JSON.stringify(theme));
  for(const width of [780,1240]){
   window.setSize(width,860);await delay(250);
   const count=await evaluate('document.querySelectorAll(".filter-choice").length');
   for(let i=0;i<count;i++){
    await click('.filter-choice:nth-child('+(i+1)+') summary');await until('document.querySelectorAll(".filter-choice[open]").length===1&&getComputedStyle(document.querySelector(".filter-choice[open] .filter-options")).visibility==="visible"');
    const fit=await evaluate('(()=>{const d=document.querySelector(".filter-choice[open]"),b=d.querySelector(".filter-options").getBoundingClientRect();return{within:b.left>=15&&b.right<=innerWidth-15&&b.top>=8&&b.bottom<=innerHeight-8,svg:!!d.querySelector("summary svg"),expanded:d.querySelector("summary").getAttribute("aria-expanded"),height:b.height};})()');assert.ok(fit.within&&fit.svg&&fit.expanded==='true',JSON.stringify(fit));
   }
   await shot('ranking-menu-'+theme+'-'+width);out.layouts.push({width,theme,exclusiveMenus:true,menusWithinViewport:true});
   await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until('!document.querySelector(".filter-choice[open]")');
   await click('.filter-choice summary');await until('!!document.querySelector(".filter-choice[open]")');await click('.rank-heading');await until('!document.querySelector(".filter-choice[open]")');
  }
 }
 out.menuKeyboardAndOutsideClose=true;
 await click('.filter-choice summary');await until('!!document.querySelector(".filter-choice[open]")');window.setSize(1000,860);await until('!document.querySelector(".filter-choice[open]")');out.menuResizeClose=true;
 await click('.filter-choice summary');await until('!!document.querySelector(".filter-choice[open]")');await evaluate('document.querySelector(".content").scrollTop=100');await until('!document.querySelector(".filter-choice[open]")');out.menuScrollClose=true;
 window.setSize(1240,860);await click('[data-view="explore"]');await until('document.querySelectorAll(".explore-page [data-series]").length>0');await shot('explore-dark');
 await evaluate('[...document.querySelectorAll(".explore-shortcuts button")].find(x=>x.textContent==="筛选").click()');await until('document.querySelectorAll(".category-browser [data-series]").length>=10');await evaluate('[...document.querySelectorAll(".category-browser .filter-row>button")].find(x=>x.textContent.startsWith("全部筛选")).click()');await until('!!document.querySelector("[aria-label=全部筛选]")');await shot('filters-dark');
 await click('[aria-label="关闭全部筛选"]');await click('[data-view="settings"]');await shot('settings-dark');await evaluate('window.hongguo.savePreferences({theme:"light"})');await until('document.documentElement.dataset.theme==="light"');await shot('settings-light');
 assert.equal(window.isVisible(),false);assert.ok(out.playback.frames>0&&out.playback.audio>0);window.webContents.debugger.detach();await fs.writeFile(folder+'/ui-smoke.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}
