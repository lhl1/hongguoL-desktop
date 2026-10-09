import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import path from 'node:path';
import { runtimePaths } from './runtime-platform.mjs';
import { safeMedia } from './apk-models.mjs';
import { decodeSpade } from './apk-spade.mjs';
import { UA } from './apk-rpc.mjs';
import {decoderFailure} from './media-diagnostics.mjs';
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
export function selectNativeTrack(response, quality = 'highest') {
  if (!['highest','360','480','540','720','1080','1440','2160'].includes(quality)) throw new Error('清晰度无效');
  const data = response.data;
  if (!data?.video_model) throw new Error('原版播放模型无效');
  let model; try { model = JSON.parse(data.video_model); } catch { throw new Error('原版播放模型格式无效'); }
  const expiry = Number(data.expire_time);
  if (expiry && expiry <= Date.now() / 1000) throw new Error('播放地址已过期，请刷新后重试');
  const candidates = (Array.isArray(model.video_list) ? model.video_list : []).filter(v => ['bytevc1', 'h264', 'avc', 'avc1', 'hevc', 'h265'].includes(String(v.video_meta?.codec_type).toLowerCase()) && v.video_meta?.vtype === 'mp4');
  const edge = v => Math.min(Number(v.video_meta?.vwidth)||Number(v.video_meta?.vheight),Number(v.video_meta?.vheight));
  candidates.sort((a,b)=>edge(b)-edge(a));
  const track = (quality==='highest'?candidates:candidates.filter(v=>edge(v)<=Number(quality)))[0] || candidates.at(-1);
  if (!track) throw new Error('本集的视频格式尚未支持');
  let key;
  if (track.encrypt_info?.encrypt) {
    if (track.encrypt_info.encryption_method !== 'cenc-aes-ctr') throw new Error('本集需要尚未适配的播放授权');
    const decoded = decodeSpade(track.encrypt_info.spade_a, 0);
    key = decoded.key.toString('ascii');
    if (decoded.envelopeVersion !== '11' || !/^[a-f0-9]{32}$/i.test(key)) throw new Error('本集的原版加密格式尚未支持');
  }
  const raw = track.main_url;
  if (typeof raw !== 'string' || raw.length > 20000) throw new Error('原版播放地址无效');
  const url = safeMedia(raw.startsWith('https://') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  const duration = Number(model.video_duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw new Error('原版视频时长无效');
  return { url, key, duration, quality: String(edge(track)), qualities: [...new Set(candidates.map(v=>String(edge(v))))].filter(v=>['360','480','540','720','1080','1440','2160'].includes(v)).map(v=>({id:v,label:v+'P'})), width: Number(track.video_meta?.vwidth) || Number(data.video_width) || 0, height: Number(track.video_meta?.vheight) || Number(data.video_height) || 0, expiry: expiry || Date.now() / 1000 + 300 };
}
export function createMediaBroker(resources, {baseURL='app://desktop',onDiagnostic=()=>{},spawnProcess=spawn,openSource}={}) {
  const sessions = new Map(), jobs = new Set(); let last = null;
  const transport=baseURL.startsWith('http://127.0.0.1:')?'loopback-http':'app-protocol';
  const origin=new URL(baseURL);if((baseURL!=='app://desktop'&&origin.href!==baseURL+'/')||!(['app://desktop',`http://127.0.0.1:${origin.port}`].includes(baseURL)))throw new Error('Local media origin invalid');
  function stopJob(job) { job.cancelled=true;job.kill();job.source?.close(); jobs.delete(job); }
  function close() { for (const job of jobs) stopJob(job); jobs.clear(); sessions.clear(); }
  function create(response, detail, episode, startSeconds = 0, quality = 'highest') {
    const track = selectNativeTrack(response, quality);
    if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 7200) throw new Error('播放进度无效');
    if (startSeconds >= track.duration - 1) startSeconds = 0;
    // Only the unguessable local stream capability reaches the renderer. URL/key stay in memory.
    const token = randomBytes(24).toString('hex');
    if (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
    sessions.set(token, { track, startSeconds });
    return { seriesId: detail.id, episode, videoId: detail.episodeList.find(e => e.number === episode).videoId, url: baseURL+'/media/' + token, poster: detail.cover, duration: track.duration, width: track.width, height: track.height, quality: track.quality, qualities: track.qualities, startSeconds, fetchedAt: Date.now(), localDecoded: true };
  }
  async function stream(token, signal) {
    const entry = sessions.get(token);
    if (!entry || entry.track.expiry <= Date.now() / 1000) return new Response('', { status: 410 });
    const { track, startSeconds } = entry;
    if (jobs.size >= 2) return new Response('',{status:429});
    if(signal?.aborted)return new Response('',{status:499});
    let source,job;
    try {
      source=openSource?.(track.url);
      const protocols=source?'pipe,http,tcp,crypto':'pipe,https,tls,tcp,crypto,httpproxy';
      const args = ['-hide_banner', '-v', 'error', '-threads', '2', '-f', 'concat', '-safe', '0', '-protocol_whitelist', protocols, '-ss', String(startSeconds), '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', '-g', '48', '-c:a', 'aac', '-b:a', '128k', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '200000', '-f', 'mp4', 'pipe:1'];
      job=spawnProcess(runtimePaths(resources).ffmpeg, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],...(source?{env:{...process.env,http_proxy:'',https_proxy:'',all_proxy:'',HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',no_proxy:'127.0.0.1',NO_PROXY:'127.0.0.1'}}:{}) });
      job.source=source;
    }catch{source?.close();return new Response('',{status:502});}
    jobs.add(job); signal?.addEventListener('abort', () => stopJob(job), { once: true });
    entry.job = job;
    const diagnostic={at:Date.now(),transport,phase:'decoder-start',bytes:0,code:null,exit:null,signal:null};let stderr='',cancelled=false;
    const report=(phase,code=diagnostic.code)=>{diagnostic.phase=phase;diagnostic.code=code;last={...diagnostic};onDiagnostic({...diagnostic});};
    signal?.addEventListener('abort',()=>{cancelled=true;},{once:true});
    job.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4096);});
    job.on('error',error=>report('decoder-exec-failed',decoderFailure('',error.code)));
    report('decoder-start');
    job.stdin.on('error', () => {});
    job.stdin.end(`ffconcat version 1.0\nfile ${quote(source?.url||track.url)}\n${track.key ? 'option decryption_key ' + track.key + '\n' : ''}option user_agent ${quote(UA)}\nduration ${track.duration}\n`);
    job.on('close', (code,signalName) => { source?.close();jobs.delete(job);diagnostic.exit=code;diagnostic.signal=signalName;const aborted=cancelled||job.cancelled;report(aborted?'cancelled':'decoder-ended',!aborted&&code!==0?decoderFailure(stderr,'',signalName):diagnostic.code);stderr=''; });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { stopJob(job); report('decoder-timeout','M106');reject(new Error('Decode startup timeout')); }, 25000);
        const finish = result => { clearTimeout(timer); job.off('error', failed); job.off('close', closed); job.stdout.off('readable', ready); result(); };
        const failed = () => finish(() => reject(new Error('Decoder failed')));
        const closed = () => { if (job.stdout.readableLength > 0) finish(resolve); else failed(); };
        const ready = () => { if (job.stdout.readableLength > 0) finish(resolve); };
        job.once('error', failed); job.once('close', closed); job.stdout.on('readable', ready);
      });
      const output=new Transform({transform(chunk,_encoding,done){diagnostic.bytes+=chunk.byteLength;done(null,chunk);}});
      job.stdout.on('error',()=>output.destroy());job.stdout.pipe(output);
      report('stream-start');return new Response(Readable.toWeb(output, { strategy: { highWaterMark: 1024 * 1024, size: chunk => chunk.byteLength } }), { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none' } });
    } catch { stopJob(job); return new Response('', { status: 502 }); }
  }
  function release(url) { let u;try{u=new URL(url);}catch{throw new Error('播放会话无效');}const m=/^\/media\/([a-f0-9]{48})$/.exec(u.pathname);if(!m||u.origin!==origin.origin||u.host!==origin.host||u.protocol!==origin.protocol||u.username||u.password||u.search||u.hash)throw new Error('播放会话无效');const e=sessions.get(m[1]);if(e?.job)stopJob(e.job);sessions.delete(m[1]); }
  return { create, stream, release, close, status: () => ({ activeDecoders: jobs.size, last }) };
}
