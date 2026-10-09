export function id(value) {
  if (typeof value !== 'string' || !/^\d{5,25}$/.test(value)) throw new Error('剧目编号无效');
  return value;
}
const text = (v, max = 3000) => typeof v === 'string' ? v.slice(0, max) : '';
const count = v => Math.max(0, Math.min(10000, Number(v) || 0));
export function safeImage(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && /\.(byteimg|douyinpic|fqnovelpic)\.com$/.test(u.hostname) ? u.href : ''; } catch { return ''; }
}
export function safeMedia(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || !/\.(qznovelvod|douyinvod|bytevod)\.com$/.test(u.hostname)) throw new Error('原版播放地址暂不支持');
  return u.href;
}
// VideoDetailVideoData, classes8.dex; parseAPKJSON preserves numeric identifiers.
export function series(v) {
  if (!v || typeof v !== 'object') throw new Error('原版剧目格式无效');
  const seriesId = id(v.series_id_str || v.series_id);
  const tags = [...(v.abstract_tags || []), ...(v.sub_title_list || [])].map(v => text(typeof v === 'string' ? v : v.text || v.content, 30));
  const episodes=count(v.episode_total_cnt || v.episode_cnt),availability=v.subscribe_item&&episodes===0?'upcoming':v.disable_play===true?'unavailable':undefined;
  let openId;try{const u=new URL(v.jump_schema);if(u.protocol==='dragon8662:'&&u.hostname==='videoDetail'&&u.searchParams.get('panel_series_from')==='series_album_rank_list')openId=id(u.searchParams.get('video_series_id'));}catch{}
  return { id: seriesId, title: text(v.series_title || v.title, 150), cover: safeImage(v.series_cover || v.cover), intro: text(v.series_intro || v.intro || v.video_desc), episodes, episodeText: text(v.episode_right_text||v.sub_title, 60), tags: [...new Set(tags.filter(Boolean))].slice(0, 8),...(availability?{availability}:{}),...(openId?{openId}:{}),...(v.rec_text_item?.RecommendText||v.rec_text?{metric:text(v.rec_text_item?.RecommendText||v.rec_text,100)}:{}) };
}
export function cells(items) {
  const result = new Map();
  // Live 7.3.9.32 responses have nested cell_data and VideoData.video_detail.
  const queue = (Array.isArray(items) ? items : []).map(value => ({ value, depth: 0 }));
  for (let cursor = 0; cursor < queue.length && cursor < 5000; cursor++) {
    const { value, depth } = queue[cursor];
    if (!value || typeof value !== 'object') continue;
    try { const clean = series(value); if (clean.title) result.set(clean.id, clean); } catch { /* Book, advertisement, or non-series card. */ }
    if (depth >= 10) continue;
    for (const key of ['cell_data', 'video_series_list', 'video_data', 'video_detail', 'video_view_data']) {
      const children = Array.isArray(value[key]) ? value[key] : value[key] ? [value[key]] : [];
      for (const child of children) if (queue.length < 5000) queue.push({ value: child, depth: depth + 1 });
    }
  }
  return [...result.values()];
}
function feedSeries(v) {
  return series({ series_id: v.series_id, series_title: v.title, series_cover: v.cover, series_intro: v.video_desc, episode_cnt: v.episode_cnt, sub_title_list: v.sub_title_list });
}
export function homeResult(response) {
  const tabs = response.data?.tab_item;
  if (!Array.isArray(tabs)) throw new Error('原版首页响应缺少栏目数据');
  const sections = [];
  for (const tab of tabs) {
    if (![16, 36, 37, 39].includes(Number(tab.tab_type))) continue;
    const items = new Map(cells(tab.cell_data).map(item => [item.id, item]));
    const videos = [...(tab.video_view_data || []).map(v => v.video_data), ...(tab.cell_data || []).flatMap(c => c.video_data || [])];
    for (const raw of videos) {
      try { const item = feedSeries(raw); if (item.title) items.set(item.id, item); } catch { /* Ads and non-series entries have no series identifier. */ }
    }
    if (items.size) sections.push({ key: String(tab.tab_type), title: text(tab.title, 40), items: [...items.values()] });
  }
  if (!sections.length) throw new Error('原版推荐流返回了尚未适配的卡片，内容解析仍在移植');
  const selected = tabs[Number(response.data.tab_index) || 0];
  const chosen = sections.find(s => s.key === String(selected?.tab_type)) || sections[0];
  return { fetchedAt: Date.now(), sections, banners: chosen.items };
}
export function searchResult(response, query) {
  response = response.search_tabs ? response : response.data;
  if (!Array.isArray(response?.search_tabs)) throw new Error('原版搜索响应缺少分栏数据');
  const tabs = response.search_tabs.filter(t => [11, 14, 29].includes(Number(t.tab_type)));
  const candidates = tabs.length ? tabs : response.search_tabs.filter(t => Number(t.tab_type) === 1);
  const items = new Map();
  for (const tab of candidates) {
    for (const item of cells(tab.data)) items.set(item.id, item);
    for (const section of tab.section_data || []) for (const item of cells(section.data)) items.set(item.id, item);
  }
  return { query, items: [...items.values()], total: items.size, hasMore: candidates.some(t => t.has_more), nextOffset: candidates[0]?.next_offset || 0, searchId: text(candidates[0]?.search_id, 100), passback: text(candidates[0]?.passback, 10000) };
}
export function detailResult(response) {
  const data = response.data;
  const clean = series(data?.video_data);
  const directory = data?.video_data?.video_list || data?.dir_data?.item_list;
  if (!Array.isArray(directory) || !directory.length) throw new Error('原版返回的剧集目录不完整');
  const episodes = directory.slice(0, 10000).map((item, i) => ({ number: Number(item.vid_index ?? i + 1), videoId: id(item.vid || item.video_id), locked: [true, 1].includes(item.disable_play) || [true, 1].includes(item.need_unlock) }));
  const numbers = new Set();
  for (const episode of episodes) {
    if (!Number.isInteger(episode.number) || episode.number < 1 || episode.number > 10000 || numbers.has(episode.number)) throw new Error('原版剧集目录编号无效');
    numbers.add(episode.number);
  }
  episodes.sort((a, b) => a.number - b.number);
  return { ...clean, episodes: Math.max(clean.episodes, episodes.length), episodeList: episodes, accessible: episodes.filter(e => !e.locked).length, videoIds: episodes.map(e => e.videoId), rating: '', favoriteText: '', videoPlatform: Number(data.video_data.video_platform) || 0, contentType: Number(data.video_data.content_type) || 0 };
}
export function playbackResult(response, detail, episode) {
  let data = response.data;
  if (!data || typeof data !== 'object') throw new Error('原版返回的播放信息不完整');
  if (!data.main_url && data.video_model) {
    let model; try { model = JSON.parse(data.video_model); } catch { throw new Error('原版播放器模型格式无效'); }
    const candidates = (Array.isArray(model.video_list) ? model.video_list : []).filter(v => !v.encrypt_info?.encrypt && !v.encrypt && ['h264', 'avc', 'avc1'].includes(String(v.video_meta?.codec_type || v.codec_type).toLowerCase()));
    const chosen = candidates.sort((a, b) => Math.abs((a.video_meta?.vheight || 0) - 720) - Math.abs((b.video_meta?.vheight || 0) - 720))[0];
    if (!chosen) {
      if (model.video_list?.some(v => v.encrypt_info?.encrypt || v.encrypt)) throw new Error('播放接口已连接，但本集为加密视频，桌面原版解码适配尚未完成');
      throw new Error('原版返回专用播放器模型，桌面解码适配尚未完成');
    }
    const decode = value => { if (typeof value !== 'string' || value.length > 20000) throw new Error('原版播放地址无效'); return value.startsWith('https://') ? value : Buffer.from(value, 'base64').toString('utf8'); };
    data = { ...data, main_url: decode(chosen.main_url), duration: model.video_duration };
  }
  if (!data.main_url) throw new Error('原版返回专用播放器模型，桌面解码适配尚未完成');
  const expiry = Number(data.expire_time);
  if (expiry && expiry < Date.now() / 1000) throw new Error('原版播放地址已过期，请刷新后重试');
  return { seriesId: detail.id, episode, videoId: detail.episodeList.find(e => e.number === episode)?.videoId, url: safeMedia(data.main_url), poster: detail.cover, duration: Number(data.duration) || 0, width: Number(data.video_width) || 0, height: Number(data.video_height) || 0, fetchedAt: Date.now(), isTrial: !!data.is_trial_video };
}
