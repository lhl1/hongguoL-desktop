import fs from 'node:fs';
import path from 'node:path';
export const DEFAULTS = Object.freeze({ theme: 'system', homeAutoplay: true, autoplay: true, defaultSpeed: 1, autoNext: true, defaultMode: 'normal', volume: 0.8, defaultQuality: 'highest', previewBeforePlay: true, defaultCatalogLayout: 'grid' });
export function createPreferences(folder) {
  const file = path.join(folder, 'preferences-v2.json'); let state = { ...DEFAULTS };
  const validate = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置格式无效');
    const next = { ...state };
    for (const [key, v] of Object.entries(value)) {
      if (!Object.hasOwn(DEFAULTS, key)) throw new Error('未知设置');
      if (['homeAutoplay','autoplay','autoNext','previewBeforePlay'].includes(key) && typeof v !== 'boolean') throw new Error('播放设置无效');
      if (key === 'theme' && !['system','light','dark'].includes(v)) throw new Error('主题无效');
      if (key === 'defaultCatalogLayout' && !['grid','list'].includes(v)) throw new Error('排列方式无效');
      if (key === 'defaultMode' && !['normal','window'].includes(v)) throw new Error('播放模式无效');
      if (key === 'defaultQuality' && !['highest','360','480','540','720','1080','1440','2160'].includes(v)) throw new Error('清晰度无效');
      if (key === 'defaultSpeed' && ![0.75,1,1.25,1.5,2].includes(v)) throw new Error('倍速无效');
      if (key === 'volume' && (!Number.isFinite(v) || v < 0 || v > 1)) throw new Error('音量无效');
      next[key] = v;
    }
    return next;
  };
  try { state = validate(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch {
    try { state = validate({...JSON.parse(fs.readFileSync(path.join(folder,'preferences-v1.json'),'utf8')),defaultMode:'normal'});fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file); } catch {}
  }
  return { read: () => ({ ...state }), update(value) { const next = validate(value); fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(next)); fs.renameSync(file + '.tmp', file); state = next; return { ...state }; } };
}
