import fs from 'node:fs';
import path from 'node:path';
import { id, safeImage } from './provider.mjs';
export function createStore(folder) {
  const file = path.join(folder, 'library-v1.json');
  let state = { version: 1, favorites: [], history: [] };
  try { const data = JSON.parse(fs.readFileSync(file, 'utf8')); if (data.version === 1 && Array.isArray(data.favorites) && Array.isArray(data.history)) state = data; } catch {}
  const snapshot = () => structuredClone(state);
  function save() {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(file + '.tmp', file);
    return snapshot();
  }
  function item(v) {
    if (!v || typeof v.title !== 'string') throw new Error('记录格式无效');
    return { id: id(v.id), title: v.title.slice(0, 150), cover: safeImage(v.cover), episodes: Math.max(0, Math.min(10000, Number(v.episodes) || 0)), episodeText: String(v.episodeText || '').slice(0, 60), tags: (Array.isArray(v.tags) ? v.tags : []).filter(x => typeof x === 'string').slice(0, 8).map(x => x.slice(0, 30)), intro: '', ...(v.availability==='upcoming'||v.availability==='unavailable'?{availability:v.availability}:{}) };
  }
  return {
    read: snapshot,
    favorite(v) { const clean = item(v); const old = state.favorites.find(x => x.id === clean.id); state.favorites = old ? state.favorites.filter(x => x.id !== clean.id) : [clean, ...state.favorites].slice(0, 300); return save(); },
    progress(v) {
      const clean = item(v);
      if (!Number.isInteger(v.episode) || v.episode < 1 || v.episode > 10000 || !Number.isFinite(v.seconds) || v.seconds < 0 || v.seconds > 86400) throw new Error('观看进度无效');
      state.history = [{ ...clean, episode: v.episode, seconds: Math.floor(v.seconds), updatedAt: Date.now() }, ...state.history.filter(x => x.id !== clean.id)].slice(0, 200);
      return save();
    },
    clearHistory() { state.history = []; return save(); }
    ,mergeHistory(items) {
      const entries = new Map(state.history.map(v => [v.id, v]));
      for (const v of items) {
        try { const clean = item(v); if (!Number.isInteger(v.episode) || v.episode < 1 || v.episode > 10000 || !Number.isFinite(v.seconds) || v.seconds < 0 || v.seconds > 7200 || !Number.isFinite(v.updatedAt) || v.updatedAt < 0) continue;
          if (!entries.has(clean.id) || entries.get(clean.id).updatedAt < v.updatedAt) entries.set(clean.id, { ...clean, episode: v.episode, seconds: Math.floor(v.seconds), updatedAt: v.updatedAt });
        } catch { /* Invalid remote record is not imported. */ }
      }
      state.history = [...entries.values()].sort((a,b) => b.updatedAt-a.updatedAt).slice(0,200); return save();
    }
  };
}
