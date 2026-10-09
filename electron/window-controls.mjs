// Hidden QA never calls native transitions: Windows can display a hidden window on restore.
export function createWindowControls(getWindow,{hidden=false,onChange=()=>{}}={}){
 let mode='normal',fullscreen=false,maximized=false,minimized=false,closed=false;const actions=[];
 function state(){const candidate=getWindow(),window=candidate&&!candidate.isDestroyed()?candidate:null;return{mode,fullscreen:hidden?fullscreen:window?.isFullScreen()||false,maximized:hidden?maximized:window?.isMaximized()||false,...(hidden?{minimized,closed}:{})};}
 function control(action){
  if(!['minimize','maximize','close','window','fullscreen','normal','state'].includes(action))throw new Error('窗口操作无效');
  const window=getWindow();if(!window||window.isDestroyed())throw new Error('窗口已关闭');
  if(hidden&&action!=='state'){actions.push(action);if(actions.length>100)actions.shift();}
  if(action==='minimize'){if(hidden)minimized=true;else window.minimize();}
  if(action==='maximize'){if(hidden){maximized=!maximized;minimized=false;}else if(window.isMaximized())window.unmaximize();else window.maximize();}
  if(action==='close'){if(hidden)closed=true;else window.close();}
  if(action==='window'){if(hidden)fullscreen=false;else if(window.isFullScreen())window.setFullScreen(false);mode=mode==='window'?'normal':'window';}
  if(action==='fullscreen'){if(hidden)fullscreen=!fullscreen;else window.setFullScreen(!window.isFullScreen());}
  if(action==='normal'){if(hidden)fullscreen=false;else window.setFullScreen(false);mode='normal';}
  const result=state();onChange(result);return result;
 }
 return{state,control,audit:()=>[...actions]};
}
