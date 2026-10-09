import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createApkSession } from '../electron/apk-session.mjs';
import * as provider from '../electron/provider.mjs';
import { rpc } from '../electron/apk-rpc.mjs';
const root = path.resolve(import.meta.dirname, '..');
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'hongguo-apk-native-'));
const session = createApkSession({ resources: path.join(root, 'native-resources'), profile: path.join(folder, 'guest.bin') });
const outcome = { freshProfile: true, androidConnection: false, time: new Date().toISOString(), checks: {} };
try {
  await session.prepare(); outcome.checks.registration = true; console.log('Fresh Windows guest registered');
  for (const category of ['推荐', '漫剧', '真人剧']) {
    try { const home = await provider.home(category); outcome.checks['home-' + category] = home.sections.map(s => ({ title: s.title, count: s.items.length })); }
    catch (error) { outcome.checks['home-' + category] = { error: error.message }; }
  }
  const search = await provider.search('BOSS'); outcome.checks.search = { count: search.items.length };
  if (!search.items.length) throw new Error('No real search cards');
  const detail = await provider.detail(search.items[0].id); outcome.checks.detail = { title: detail.title, episodes: detail.episodeList.length, accessible: detail.accessible, platform: detail.videoPlatform, contentType: detail.contentType };
  for (const mode of [true, false]) {
    const raw = await rpc('model', { video_id: detail.episodeList[0].videoId, content_type: detail.contentType, biz_param: { video_id_type: 0, video_platform: detail.videoPlatform, source: 0, need_all_video_definition: true, use_os_player: mode, need_mp4_align: true } });
    const data = raw.data; const model = data?.video_model ? JSON.parse(data.video_model) : {};
    outcome.checks['model-os-' + mode] = { keys: Object.keys(data || {}), formats: (model.video_list || []).map(v => ({ codec: v.video_meta?.codec_type, container: v.video_meta?.vtype, encrypted: v.encrypt_info?.encrypt, encryptionMethod: v.encrypt_info?.encryption_method })) };
  }
  outcome.status = provider.status();
} catch (error) { outcome.error = error.message; process.exitCode = 1; }
finally {
  session.close(); await fs.rm(folder, { recursive: true, force: true });
  await fs.mkdir(path.join(root, 'test-results-apk'), { recursive: true });
  await fs.writeFile(path.join(root, 'test-results-apk/native-live.json'), JSON.stringify(outcome, null, 2)); console.log(JSON.stringify(outcome, null, 2));
}
