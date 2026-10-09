import { rpc, configureFetch as configureRPCFetch, status as rpcStatus } from './apk-rpc.mjs';
import { randomUUID } from 'node:crypto';
import { id, homeResult, detailResult, playbackResult } from './apk-models.mjs';
import { clearPages } from './catalog-pages.mjs';
import { clearSearch } from './search-pages.mjs';
import {clearFamilies} from './series-families.mjs';
import {clearCategories} from './category-pages.mjs';
export {filterCatalog,actorWorks} from './category-pages.mjs';
export {family,seriesGroups} from './series-families.mjs';
export { search, suggest } from './search-pages.mjs';
export { feed, rankings } from './catalog-pages.mjs';
export { ORIGIN, UA } from './apk-rpc.mjs';
export { id, safeImage, safeMedia } from './apk-models.mjs';
const cache = new Map();
let playbackAdapter;
export function configurePlaybackAdapter(value) { playbackAdapter = value; }
export function invalidateCatalog() { cache.clear(); clearPages(); clearSearch(); clearFamilies(); clearCategories(); }
export function configureFetch(fetcher) { configureRPCFetch(fetcher); invalidateCatalog(); }
export function status() { const state = rpcStatus(); return { ...state, nativePlayback: !!playbackAdapter, pending: state.onlineVerified ? playbackAdapter ? [] : ['live-playback'] : ['online-verification'] }; }
export async function home(category = '推荐') {
  // seriesmall.b.d -> bookmall.y.f -> rpc.c.d. BottomTabBarItemType.VideoSeriesFeedTab = 7.
  // -1 asks the server to select the initial tab; session_uuid is a client session, not a device ID.
  const tabs = { '推荐': -1, '漫剧': 36, '真人剧': 39 };
  if (!Object.hasOwn(tabs, category)) throw new Error('首页栏目无效');
  return homeResult(await rpc('tabs', { tab_type: tabs[category], offset: 0, bottom_tab_type: 7, client_req_type: 3, screen_width_px: '1280', session_uuid: randomUUID(), enable_search_box_collapse: false }));
}
export async function detail(seriesId) {
  id(seriesId);
  const old = cache.get(seriesId);
  if (old && Date.now() - old.at < 30000) return structuredClone(old.value);
  const value = detailResult(await rpc('detail', { series_id: seriesId, biz_param: { source: 0, screen_width_px: '1280', detail_page_version: 0, disable_digg_stat: false, disable_video_relate_book: false, need_all_video_definition: true, need_mp4_align: true, use_os_player: true, use_server_dns: false, video_id_type: 0 } }));
  if (value.id !== seriesId) throw new Error('原版返回的剧目与请求不一致');
  if (cache.size >= 50) cache.delete(cache.keys().next().value);
  cache.set(seriesId, { at: Date.now(), value }); return structuredClone(value);
}
export async function playback(seriesId, episode, startSeconds = 0, quality = 'highest') {
  id(seriesId);
  if (!Number.isInteger(episode) || episode < 1 || episode > 10000) throw new Error('集数无效');
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 7200) throw new Error('播放进度无效');
  const data = await detail(seriesId);
  const item = data.episodeList.find(e => e.number === episode);
  if (!item) throw new Error('原版目录中没有这一集');
  if (item.locked) throw new Error('这一集需要原版授权，桌面授权流程尚未完成');
  const response = await rpc('model', { video_id: item.videoId, content_type: data.contentType, biz_param: { video_id_type: 0, video_platform: data.videoPlatform, source: 0, need_all_video_definition: true, use_os_player: true, need_mp4_align: true } });
  return playbackAdapter ? playbackAdapter(response, data, episode, startSeconds, quality) : playbackResult(response, data, episode);
}
