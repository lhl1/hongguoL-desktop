import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAPKJSON, buildURL, configureContext, configureRequestEnricher, rpc, status } from '../electron/apk-rpc.mjs';
import * as provider from '../electron/provider.mjs';
import { homeResult, searchResult, detailResult, playbackResult } from '../electron/apk-models.mjs';
// Synthetic contract cases derived from decompiled APK models, not captured live responses.
const sid = '7689844778497739800';
const rawSeries = { series_id_str: sid, series_title: '协议测试剧', series_cover: 'https://p3-novel.byteimg.com/cover', episode_total_cnt: 6 };
const directory = Array.from({ length: 6 }, (_, i) => ({ video_id: String(BigInt(sid) + BigInt(i + 1)), need_unlock: i === 2 }));
const detailResponse = { code: 0, data: { video_data: { ...rawSeries, video_platform: 1 }, dir_data: { item_list: directory } } };
test('APK int64 IDs survive JSON decoding, including escaped quotes and ordinary numbers', () => {
  const data = parseAPKJSON('{"series_id":7689844778497739800,"offset":20,"title":"123 \\\" 9007199254740993","ratio":1.5,"negative":-9007199254740993}');
  assert.equal(data.series_id, sid); assert.equal(data.offset, 20); assert.equal(data.negative, '-9007199254740993'); assert.equal(data.ratio, 1.5);
  assert.throws(() => parseAPKJSON('{"x":01}'));
});
test('APK path substitution uses API version independently of application version', () => {
  configureContext({ common: {}, version: '' });
  assert.equal(buildURL('search', { query: '中文 剧' }).pathname, '/reading/bookapi/search/tab/v');
  assert.equal(buildURL('search', { query: '中文 剧' }).searchParams.get('query'), '中文 剧');
  configureContext({ common: {}, version: '1' });
  assert.equal(buildURL('search').pathname, '/reading/bookapi/search/tab/v1');
  configureContext({ common: {}, version: '' });
  assert.throws(() => buildURL('../../private'));
});
test('search reads real APK drama-card structure and ignores book cards', () => {
  const result = searchResult({ search_tabs: [{ tab_type: 11, data: [{ video_series_list: [rawSeries, rawSeries] }, { book_data: { book_id: sid } }], has_more: true, next_offset: 20 }] }, '测试');
  assert.equal(result.items.length, 1); assert.equal(result.items[0].id, sid); assert.equal(result.hasMore, true);
  assert.throws(() => searchResult({ data: [] }, '测试'));
});
test('home reads the selected original short-drama feed and ignores novel tabs', () => {
  const result = homeResult({ data: { tab_index: 1, tab_item: [
    { tab_type: 1, title: '小说', cell_data: [{ video_detail: rawSeries }] },
    { tab_type: 16, title: '推荐', video_view_data: [{ video_data: { series_id: sid, title: '协议测试剧', cover: rawSeries.series_cover, episode_cnt: 6 } }] }
  ] } });
  assert.equal(result.sections.length, 1); assert.equal(result.sections[0].title, '推荐'); assert.equal(result.banners[0].id, sid);
});
test('availability follows every directory entry and preserves episodes after a locked entry', () => {
  const detail = detailResult(detailResponse);
  assert.equal(detail.episodeList.length, 6); assert.equal(detail.accessible, 5);
  assert.equal(detail.episodeList[2].locked, true); assert.equal(detail.episodeList[5].locked, false);
  assert.throws(() => detailResult({ data: { video_data: rawSeries } }));
});
test('media expiry, private models, and non-CDN URLs are rejected explicitly', () => {
  const detail = detailResult(detailResponse);
  assert.throws(() => playbackResult({ data: { main_url: 'https://localhost/video' } }, detail, 1));
  assert.throws(() => playbackResult({ data: { main_url: 'https://v1.qznovelvod.com/video', expire_time: 1 } }, detail, 1));
  assert.throws(() => playbackResult({ data: { video_model: '{}' } }, detail, 1), /解码适配/);
});
test('provider contacts only APK hosts, refuses locked episodes, and does not limit episode 6', async () => {
  const calls = [], bodies = [];
  provider.configureFetch(async (address, options) => {
    const url = new URL(address); calls.push(url);
    bodies.push(options.body && JSON.parse(options.body));
    assert.equal(url.origin, 'https://reading.snssdk.com');
    assert.match(options.headers['x-reading-request'], /^\d+-\d+$/);
    const data = url.pathname.includes('video_detail') ? detailResponse : { code: 0, data: { main_url: 'https://v1.qznovelvod.com/video', expire_time: Date.now() / 1000 + 3600 } };
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  });
  const play = await provider.playback(sid, 6); assert.equal(play.episode, 6);
  const before = calls.length; await assert.rejects(provider.playback(sid, 3), /授权/); assert.equal(calls.length, before);
  assert.equal(calls[1].pathname, '/novel/player/video_model/v1/');
  assert.equal(bodies[1].video_id, directory[5].video_id); assert.equal(bodies[1].biz_param.use_os_player, true);
  assert.equal(typeof bodies[0].series_id, 'string'); assert.equal(typeof bodies[0].biz_param.screen_width_px, 'string');
});
test('empty and PARAM_INVALID responses remain errors rather than successful empty catalogs', async () => {
  provider.configureFetch(async () => new Response(''));
  await assert.rejects(rpc('search', { query: '测试' }), /空响应/);
  assert.equal(status().last.outcome, 'empty-response');
  provider.configureFetch(async () => new Response('{"code":100103,"data":null,"message":"PARAM_INVALID"}'));
  await assert.rejects(rpc('search'), /100103/);
  provider.configureFetch(async () => new Response('{"code":0}', { headers: { 'x-reading-response': 'invalid' } }));
  await assert.rejects(rpc('search'), /校验失败/);
});
test('request adapter cannot redirect APK traffic to other endpoints', async () => {
  configureRequestEnricher(async request => ({ ...request, url: 'https://example.com/private' }));
  await assert.rejects(rpc('search'), /地址/);
  configureRequestEnricher(async request => request);
});
