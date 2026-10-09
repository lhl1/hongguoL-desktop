import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMediaBroker, selectNativeTrack } from '../electron/apk-media.mjs';
const detail = { id: '123456789', cover: '', episodeList: [{ number: 6, videoId: '987654321' }] };
const response = (changes = {}, modelChanges = {}) => ({ data: { expire_time: Date.now() / 1000 + 60, video_model: JSON.stringify({ video_duration: 30, video_list: [{ main_url: 'https://v1.qznovelvod.com/test.mp4', video_meta: { codec_type: 'h264', vtype: 'mp4', vheight: 720 }, ...changes }], ...modelChanges }) } });
test('local player refuses foreign hosts, expired models and unknown encryption', () => {
  assert.throws(() => selectNativeTrack(response({ main_url: 'https://example.com/video.mp4' })), /播放地址/);
  const expired = response(); expired.data.expire_time = 1;
  assert.throws(() => selectNativeTrack(expired), /过期/);
  assert.throws(() => selectNativeTrack(response({ encrypt_info: { encrypt: true, encryption_method: 'other' } })), /授权/);
  assert.throws(() => selectNativeTrack(response({}, { video_duration: Infinity })), /时长/);
});
test('renderer receives only local capability and completed episodes restart safely', async () => {
  const broker = createMediaBroker('unused');
  const playback = broker.create(response(), detail, 6, 30);
  assert.equal(playback.startSeconds, 0);
  assert.match(playback.url, /^app:\/\/desktop\/media\/[a-f0-9]{48}$/);
  assert.equal(JSON.stringify(playback).includes('qznovelvod'), false);
  assert.equal((await broker.stream('unknown')).status, 410);
  broker.close();
  assert.equal((await broker.stream(playback.url.split('/').at(-1))).status, 410);
});
