const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('hongguo', Object.freeze({
  platform: process.platform,
  home: category => invoke('catalog:home', category),
  search: (query,cursor) => invoke('catalog:search', query,cursor),
  suggest: query => invoke('catalog:suggest',query),
  detail: id => invoke('catalog:detail', id),
  family: id => invoke('catalog:family', id),
  seriesGroups: ids => invoke('catalog:seriesGroups', ids),
  filterCatalog: (selection,cursor) => invoke('catalog:filterCatalog',selection,cursor),
  actorWorks: (id,cursor) => invoke('catalog:actorWorks',id,cursor),
  playback: (id, episode, startSeconds = 0, quality = 'highest') => invoke('catalog:playback', id, episode, startSeconds, quality),
  feed:(category,cursor) => invoke('catalog:feed',category,cursor),rankings:(selection,cursor)=>invoke('catalog:rankings',selection,cursor),
  mediaDiagnostics:()=>invoke('media:diagnostics'),
  exportLogs:()=>invoke('diagnostics:export'),logVideo:value=>invoke('diagnostics:video',value),
  release: url=>invoke('media:release',url),windowControl: action=>invoke('window:control',action),
  onWindow:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('window:changed',listener);return()=>ipcRenderer.removeListener('window:changed',listener);},
  library: () => invoke('library:read'),
  favorite: item => invoke('library:favorite', item),
  progress: item => invoke('library:progress', item),
  clearHistory: () => invoke('library:clearHistory'),
  status: () => invoke('app:status')
  ,preferences: () => invoke('preferences:read'),
  savePreferences: value => invoke('preferences:update', value),
  account: () => invoke('account:info'), sendCode: phone => invoke('account:sendCode', phone),
  login: (phone, code) => invoke('account:login', phone, code), logout: () => invoke('account:logout'), sync: () => invoke('account:sync'),
  onPreferences: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('preferences:changed', listener); return () => ipcRenderer.removeListener('preferences:changed', listener); },
  onSync: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('account:sync-result', listener); return () => ipcRenderer.removeListener('account:sync-result', listener); }
}));
