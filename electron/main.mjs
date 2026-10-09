import { app, BrowserWindow, ipcMain, protocol, net, session, safeStorage, nativeTheme, Menu, dialog } from 'electron';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as provider from './provider.mjs';
import { createStore } from './store.mjs';
import { createApkSession } from './apk-session.mjs';
import { createMediaBroker } from './apk-media.mjs';
import { createImageBroker } from './images.mjs';
import { createPreferences } from './preferences.mjs';
import { createAccount } from './account.mjs';
import { createWindowControls } from './window-controls.mjs';
import {createPassportFetch} from './passport-transport.mjs';
import {configurePassportFetch} from './apk-rpc.mjs';
import {nativeResources, encryptLocal} from './runtime-platform.mjs';
import {createMacMediaTransport,macMediaPermission} from './mac-media-transport.mjs';
import {decoderMessage} from './media-diagnostics.mjs';
import {createDiagnosticLog} from './diagnostic-log.mjs';
import {createMacSourceBridge} from './mac-source-bridge.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const mediaSelfTest=process.argv.includes('--media-self-test');
const smoke = process.argv.includes('--smoke-test')||mediaSelfTest;
const useMacMedia=process.platform==='darwin'||(smoke&&process.argv.includes('--smoke-mac-media'));
if (process.platform === 'darwin') app.setName('Hongguo');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (smoke) app.setPath('userData', path.join(app.getPath('temp'), 'hongguo-desktop-smoke', String(Date.now()) + '-' + process.pid));
else app.setPath('userData', path.join(app.getPath('appData'), 'hongguo-desktop'));
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
let window;
let apkSession;
let mediaBroker;
let mediaTransport;
let sourceBridge;
let diagnosticWrites=Promise.resolve();
let imageBroker;
let diagnosticLog;
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
app.whenReady().then(async () => {
  if (smoke && process.platform === 'darwin') app.setActivationPolicy('accessory');
  const resources = nativeResources(directory, {packaged: app.isPackaged, resourcesPath: process.resourcesPath});
  if (!smoke && process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label: '红果', submenu: [{role:'about'}, {type:'separator'}, {role:'hide'}, {role:'hideOthers'}, {role:'unhide'}, {type:'separator'}, {role:'quit'}]},
    {role:'editMenu'}, {role:'windowMenu'}
  ]));
  if(mediaSelfTest){const {runMediaSelfTest}=await import('./mac-media-check.mjs');try{await runMediaSelfTest({app,BrowserWindow,protocol,resources});app.exit(0);}catch{app.exit(1);}return;}
  diagnosticLog=createDiagnosticLog(app.getPath('userData'),{metadata:{version:app.getVersion(),platform:process.platform,arch:process.arch,electron:process.versions.electron,chrome:process.versions.chrome,node:process.versions.node,osRelease:os.release()}});
  diagnosticLog.record('lifecycle',{event:'start'});
  const contentFetch=(url,options)=>net.fetch(url,{...options,...(useMacMedia?{credentials:'omit'}:{})});
  provider.configureFetch(contentFetch);
  configurePassportFetch(createPassportFetch(net));
  apkSession = createApkSession({ resources, profile: path.join(app.getPath('userData'), 'apk-guest.bin'), fetcher: contentFetch, encode: value => encryptLocal(safeStorage, value), decode: value => safeStorage.decryptString(value), persistent:!useMacMedia,onDiagnostic:value=>diagnosticLog.record('guest',value) });
  if(useMacMedia)mediaTransport=await createMacMediaTransport({stream:(...args)=>mediaBroker.stream(...args)});
  if(useMacMedia)sourceBridge=await createMacSourceBridge({fetcher:(url,options)=>net.fetch(url,options),onDiagnostic:value=>diagnosticLog.record('source',value)});
  const onDiagnostic=value=>{diagnosticLog.record('decoder',value);if(value.code&&process.platform==='darwin'&&!smoke){const file=path.join(app.getPath('home'),'Library/Logs/Hongguo/playback-diagnostics.json');diagnosticWrites=diagnosticWrites.then(async()=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify({version:app.getVersion(),platform:process.platform,arch:process.arch,decoder:value},null,2));}).catch(()=>{});}};
  mediaBroker = createMediaBroker(resources,{...(mediaTransport?{baseURL:mediaTransport.baseURL,openSource:sourceBridge.open}:{}),onDiagnostic});
  imageBroker = createImageBroker(resources, contentFetch);
  provider.configurePlaybackAdapter(mediaBroker.create);
  session.defaultSession.webRequest.onBeforeSendHeaders({urls: ['https://*.qznovelvod.com/*', 'https://*.douyinvod.com/*', 'https://*.bytevod.com/*']}, (details, callback) => {
    callback({ requestHeaders: {...details.requestHeaders, 'User-Agent': provider.UA} });
  });
  protocol.handle('app', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'desktop' || request.method !== 'GET') return new Response('', { status: 403 });
    const media = /^\/media\/([a-f0-9]{48})$/.exec(url.pathname);
    if (media) return mediaBroker.stream(media[1], request.signal);
    if (url.pathname === '/image') return imageBroker.handle(url.searchParams.get('src'));
    let relative;
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch { return new Response('', { status: 400 }); }
    const root = path.resolve(directory, '../dist');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep) || !/\.(html|js|css|png|webp|svg|ico)$/.test(target)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(target).href);
  });
  const mediaPermission=(wc,permission,origin)=>permission==='fullscreen'||(wc===window?.webContents&&macMediaPermission(permission,origin,useMacMedia));
  session.defaultSession.setPermissionRequestHandler((wc,permission,callback,details)=>callback(mediaPermission(wc,permission,details.requestingUrl||wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc,permission,origin)=>mediaPermission(wc,permission,origin));
  const guestStore = createStore(app.getPath('userData')); let store = guestStore;
  const preferences = createPreferences(app.getPath('userData'));
  const readPreferences = () => ({ ...preferences.read(), resolvedTheme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light' });
  nativeTheme.themeSource = preferences.read().theme;
  const account = createAccount({ folder: app.getPath('userData'), encode: value => encryptLocal(safeStorage, value), decode: value => safeStorage.decryptString(value), autoLoad:!useMacMedia,getStore: () => store, detail: provider.detail, onChange: uid => { provider.invalidateCatalog(); store = uid ? createStore(path.join(app.getPath('userData'),'accounts',uid)) : guestStore; if (uid && !store.read().history.length) store.mergeHistory(guestStore.read().history); } });
  await account.init();
  let syncTimer;
  let smokePlaybackDelay=0,smokeRankingDelay=0,smokeFeedDelay=0,smokePlaybackFailureEpisode=0,smokeDetailDelay=0,smokeFilterDelay=0,smokeDetailFailure=false;
  const controls=createWindowControls(()=>window,{hidden:smoke,onChange:state=>{diagnosticLog.record('window',state);if(window&&!window.isDestroyed())window.webContents.send('window:changed',state);}});
  const controlWindow=controls.control,publishWindow=()=>{if(window&&!window.isDestroyed())window.webContents.send('window:changed',controls.state());};
  const scheduleSync = () => { if (!account.info().loggedIn || syncTimer) return; syncTimer = setTimeout(() => { syncTimer = undefined; void account.sync().then(data => window?.webContents.send('account:sync-result', { ok: true, data })).catch(error => window?.webContents.send('account:sync-result', { ok: false, error: error.message })); }, 15000); };
  let exportingLog=false,lastVideoLog=0;
  async function exportLog(){
    if(exportingLog)return{canceled:true};exportingLog=true;
    try{
      const choice=smoke?{canceled:false,filePath:path.join(path.resolve(process.env.HONGGUO_SMOKE_OUTPUT||path.resolve(directory,'../test-results')),'exported-diagnostics.log')}:await dialog.showSaveDialog(window,{title:'导出诊断日志',defaultPath:path.join(app.getPath('downloads'),'Hongguo-'+new Date().toISOString().replace(/[:.]/g,'-')+'.log'),filters:[{name:'诊断日志',extensions:['log']}],buttonLabel:'导出'});
      if(choice.canceled||!choice.filePath)return{canceled:true};
      diagnosticLog.record('window',controls.state());diagnosticLog.record('decoder',mediaBroker.status().last);
      return await diagnosticLog.exportTo(choice.filePath);
    }catch{diagnosticLog.record('lifecycle',{event:'export-failed',code:'WRITE_FAILED'});throw new Error('日志导出失败，请选择可写入的位置后重试');}finally{exportingLog=false;}
  }
  const handlers = {
    'diagnostics:export':exportLog,'diagnostics:video':value=>{if(Date.now()-lastVideoLog<200&&value?.event!=='error')return;lastVideoLog=Date.now();diagnosticLog.record('video',value);},
    'catalog:home': provider.home, 'catalog:search': provider.search, 'catalog:suggest':provider.suggest,
    'catalog:family':provider.family,'catalog:seriesGroups':provider.seriesGroups,
    'catalog:filterCatalog':async(...args)=>{if(smoke&&smokeFilterDelay)await new Promise(resolve=>setTimeout(resolve,smokeFilterDelay));return provider.filterCatalog(...args);},'catalog:actorWorks':provider.actorWorks,
    'catalog:detail':async(...args)=>{const fail=smoke&&smokeDetailFailure;if(smoke&&smokeDetailDelay)await new Promise(resolve=>setTimeout(resolve,smokeDetailDelay));if(fail)throw new Error('测试模拟：详情请求失败');return provider.detail(...args);}, 'catalog:playback': async(...args)=>{const fail=smoke&&smokePlaybackFailureEpisode>0&&args[1]===smokePlaybackFailureEpisode;if(fail)smokePlaybackFailureEpisode=0;if(smoke&&smokePlaybackDelay)await new Promise(resolve=>setTimeout(resolve,smokePlaybackDelay));if(fail)throw new Error('测试模拟：目标视频请求失败');return provider.playback(...args);},
    'catalog:feed':async(...args)=>{if(smoke&&smokeFeedDelay)await new Promise(resolve=>setTimeout(resolve,smokeFeedDelay));return provider.feed(...args);},'catalog:rankings':async(...args)=>{if(smoke&&smokeRankingDelay)await new Promise(resolve=>setTimeout(resolve,smokeRankingDelay));return provider.rankings(...args);},'media:release':mediaBroker.release,'media:diagnostics':()=>{const status=mediaBroker.status();return{...status,message:decoderMessage(status.last?.code)};},
    'window:control':controlWindow,
    'library:read': () => store.read(), 'library:favorite': v => store.favorite(v),
    'library:progress': v => { const result = store.progress(v); scheduleSync(); return result; }, 'library:clearHistory': () => store.clearHistory(),
    'preferences:read': readPreferences, 'preferences:update': value => { preferences.update(value); nativeTheme.themeSource = preferences.read().theme; window?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#16181d' : '#f6f7f9'); return readPreferences(); },
    'account:info': account.info, 'account:sendCode': account.sendCode, 'account:login': account.login, 'account:sync': account.sync,
    'account:logout': async () => { clearTimeout(syncTimer); const result = await account.logout(); await session.defaultSession.clearStorageData({ storages: ['cookies'] }); return result; },
    'app:status': provider.status
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame || !event.senderFrame.url.startsWith('app://desktop/')) throw new Error('拒绝非应用页面调用');
    const started=performance.now();
    try { const data=await handler(...args);diagnosticLog.record('ipc',{channel,ok:true,ms:performance.now()-started});return { ok: true, data }; }
    catch (error) { diagnosticLog.record('ipc',{channel,ok:false,ms:performance.now()-started});return { ok: false, error: error instanceof Error ? error.message : '操作失败，请重试' }; }
  });
  window = new BrowserWindow({ width: 1240, height: 860, minWidth: 780, minHeight: 620, frame:false, show: !smoke, autoHideMenuBar: true, title: process.platform === 'darwin' ? '红果 · macOS' : '红果 · Windows', backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#f6f7f9', webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, offscreen: smoke, backgroundThrottling: !smoke, autoplayPolicy: 'no-user-gesture-required' } });
  for(const event of ['maximize','unmaximize','enter-full-screen','leave-full-screen'])window.on(event,publishWindow);
  nativeTheme.on('updated', () => { window?.webContents.send('preferences:changed', readPreferences()); });
  window.on('closed', () => clearTimeout(syncTimer));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (smoke) window.webContents.setAudioMuted(true);
  window.webContents.on('render-process-gone',(_event,details)=>diagnosticLog.record('renderer',{reason:details.reason,exit:details.exitCode}));
  for(const event of ['unresponsive','responsive'])window.on(event,()=>diagnosticLog.record('lifecycle',{event}));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.on('closed', () => { window = null; });
  await window.loadURL('app://desktop/index.html');
  diagnosticLog.record('lifecycle',{event:'ready'});
  if (!smoke) scheduleSync();
  if (smoke) {
    const { runSmoke } = await import(process.argv.includes('--official-filter-smoke-only')?'./official-filter-smoke.mjs':process.argv.includes('--episode-selection-smoke-only')?'./episode-selection-smoke.mjs':process.argv.includes('--preview-smoke-only')?'./preview-smoke.mjs':process.argv.includes('--ui-smoke-only')?'./ui-smoke.mjs':process.argv.includes('--rank-filter-smoke-only')?'./smoke-rank15.mjs':'./smoke.mjs');
    const testFolder = smoke && process.env.HONGGUO_SMOKE_OUTPUT ? path.resolve(process.env.HONGGUO_SMOKE_OUTPUT) : app.isPackaged ? path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')), 'test-results') : path.resolve(directory, '../test-results');
    const diagnosticTimer=setInterval(()=>{void fs.mkdir(testFolder,{recursive:true}).then(()=>fs.writeFile(path.join(testFolder,'safe-media-diagnostics.json'),JSON.stringify({broker:mediaBroker.status(),http:mediaTransport?.status()},null,2))).catch(()=>{});},2000);diagnosticTimer.unref();app.once('will-quit',()=>clearInterval(diagnosticTimer));
    try { await runSmoke(window, testFolder,{setDetailDelay:ms=>{smokeDetailDelay=ms;},setDetailFailure:value=>{smokeDetailFailure=value;},setFilterDelay:ms=>{smokeFilterDelay=ms;},windowActions:controls.audit,mediaStatus:mediaBroker.status,setPlaybackDelay:ms=>{smokePlaybackDelay=ms;},setPlaybackFailure:episode=>{smokePlaybackFailureEpisode=episode;},setRankingDelay:ms=>{smokeRankingDelay=ms;},setFeedDelay:ms=>{smokeFeedDelay=ms;}}); mediaTransport?.close(); mediaBroker.close(); imageBroker.close(); apkSession.close(); app.exit(0); }
    catch (error) { try { await fs.mkdir(testFolder, { recursive: true }); await fs.writeFile(path.join(testFolder, 'smoke-error.txt'), String(error.stack || error));await fs.writeFile(path.join(testFolder,'safe-media-diagnostics.json'),JSON.stringify({broker:mediaBroker.status(),http:mediaTransport?.status()},null,2)); } finally { mediaTransport?.close(); mediaBroker.close(); imageBroker.close(); apkSession.close(); app.exit(1); } }
  }
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { mediaTransport?.close();mediaBroker?.close();sourceBridge?.close(); imageBroker?.close(); apkSession?.close();diagnosticLog?.record('lifecycle',{event:'quit'});diagnosticLog?.flush(); });
