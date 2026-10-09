import { test } from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/catalog.mjs';
import { parseAPKJSON } from '../electron/apk-rpc.mjs';
import { homeResult, searchResult, detailResult, playbackResult } from '../electron/apk-models.mjs';
test('synthetic APK-shaped search response parses nested VideoData cards without treating UGC as a series', async () => {
  const result = searchResult(await fixture('reading-bookapi-search-tab-v'), 'BOSS');
  assert.ok(result.items.length >= 5); assert.ok(result.items.every(item => /^\d{19}$/.test(item.id) && item.title));
});
test('synthetic APK-shaped bookmall response parses nested type 407 cards', async () => {
  const result = homeResult(await fixture('reading-bookapi-bookmall-tab-v'));
  assert.ok(result.sections.length > 0); assert.ok(result.banners.length > 0);
});
test('synthetic SaaS-shaped detail preserves the complete 230-episode directory', async () => {
  const detail = detailResult(await fixture('novel-player-video_detail-v1'));
  assert.equal(detail.episodeList.length, 230); assert.equal(detail.episodeList.at(-1).number, 230);
  assert.equal(detail.episodeList.at(-1).videoId.length, 19);
});
test('plain standard model URLs are decoded and encrypted models are refused before handing URLs to the renderer', () => {
  const detail = { id: '7689844778497739800', cover: '', episodeList: [{ number: 4, videoId: '7689844778497739806' }] };
  const model = { video_duration: 22, video_list: [{ main_url: Buffer.from('https://v1.qznovelvod.com/movie').toString('base64'), video_meta: { codec_type: 'h264', vheight: 720 }, encrypt_info: { encrypt: false } }] };
  assert.equal(playbackResult({ data: { video_model: JSON.stringify(model) } }, detail, 4).videoId, detail.episodeList[0].videoId);
  model.video_list[0].encrypt_info.encrypt = true;
  assert.throws(() => playbackResult({ data: { video_model: JSON.stringify(model) } }, detail, 4), /加密视频/);
});
