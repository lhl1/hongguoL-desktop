import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {bufferProfile,createReadAhead} from './media-buffer.mjs';
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
export function createMediaBroker(resources, {baseURL='app://desktop',onDiagnostic=()=>{},spawnProcess=spawn,openSource,getAggressiveBuffer=()=>true,getTimelineMode=()=>false}={}) {
  const sessions = new Map(), jobs = new Set(); let last = null;
  const transport=baseURL.startsWith('http://127.0.0.1:')?'loopback-http':'app-protocol';
  const origin=new URL(baseURL);if((baseURL!=='app://desktop'&&origin.href!==baseURL+'/')||!(['app://desktop',`http://127.0.0.1:${origin.port}`].includes(baseURL)))throw new Error('Local media origin invalid');
  function stopJob(job) {
    if (job.cancelled) return;
    job.cancelled=true;job.cleanup?.();job.kill();
    job.stdout.destroy();job.output?.destroy();
  }
  function close() { for (const job of jobs) stopJob(job); jobs.clear(); sessions.clear(); }
  function create(response, detail, episode, startSeconds = 0, quality = 'highest') {
    const track = selectNativeTrack(response, quality);
    if (!Number.isFinite(startSeconds) || startSeconds < 0 || startSeconds > 7200) throw new Error('播放进度无效');
    if (startSeconds >= track.duration - 1) startSeconds = 0;
    // Only the unguessable local stream capability reaches the renderer. URL/key stay in memory.
    const token = randomBytes(24).toString('hex');
    if (sessions.size >= 8) {const oldest=sessions.keys().next().value;const old=sessions.get(oldest);if(old.job)stopJob(old.job);sessions.delete(oldest);}
    const timeline=!!getTimelineMode();sessions.set(token, { track, startSeconds,timeline });
    return { seriesId: detail.id, episode, videoId: detail.episodeList.find(e => e.number === episode).videoId, url: baseURL+'/media/' + token, poster: detail.cover, duration: track.duration, width: track.width, height: track.height, quality: track.quality, qualities: track.qualities, startSeconds, fetchedAt: Date.now(), expiresAt: track.expiry*1000, localDecoded: true,timeline };
  }
  async function stream(token, signal) {
    const entry = sessions.get(token);
    const rejected=(status,code)=>{last={transport,phase:'stream-rejected',status,activeDecoders:jobs.size,code,bytes:0};onDiagnostic({...last});return new Response('',{status});};
    if (!entry || entry.track.expiry <= Date.now() / 1000) return rejected(410,'M108');
    const { track, startSeconds,timeline } = entry;
    // Chromium may reopen one capability. Its previous consumer must not orphan a job.
    if(entry.job)stopJob(entry.job);
    if (jobs.size >= 2) return rejected(429,'M107');
    if(signal?.aborted)return new Response('',{status:499});
    let source,job;
    try {
      source=openSource?.(track.url);
      const protocols=source?'pipe,http,tcp,crypto':'pipe,https,tls,tcp,crypto,httpproxy';
      const samples=Math.max(1,Math.round((track.duration-startSeconds)*48000));
      // Preserve the episode's full original duration, including a naturally silent video tail.
      // No duration or silence is added between episodes, and FLAC adds no encoder priming.
      const audio=timeline?['-c:a','flac','-ar','48000','-ac','2','-sample_fmt','s16','-af',`aresample=48000,apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB`,'-strict','-2']:['-c:a','aac','-b:a','128k'];
      const video=timeline?['-profile:v','high','-level:v','5.2','-bf','0','-video_track_timescale','48000','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2,setpts=PTS-STARTPTS','-t',String(Math.max(.001,track.duration-startSeconds))]:[];
      const args = ['-hide_banner', '-v', 'error', '-progress','pipe:2','-stats_period','1', '-threads', '2', '-f', 'concat', '-safe', '0', '-protocol_whitelist', protocols, '-ss', String(startSeconds), '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '2', '-g', '48', ...video,...audio, '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '200000', '-f', 'mp4', 'pipe:1'];
      job=spawnProcess(runtimePaths(resources).ffmpeg, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],...(source?{env:{...process.env,http_proxy:'',https_proxy:'',all_proxy:'',HTTP_PROXY:'',HTTPS_PROXY:'',ALL_PROXY:'',no_proxy:'127.0.0.1',NO_PROXY:'127.0.0.1'}}:{}) });
      job.source=source;
    }catch{source?.close();return new Response('',{status:502});}
    jobs.add(job);const aborted=()=>stopJob(job);signal?.addEventListener('abort', aborted, { once: true });
    entry.job = job;entry.produced=0;entry.finished=false;
    const profile=bufferProfile(getAggressiveBuffer());let pulse,lastBytesAt=Date.now();
    let cleaned=false;job.cleanup=()=>{if(cleaned)return;cleaned=true;clearInterval(pulse);source?.close();jobs.delete(job);if(entry.job===job)entry.job=undefined;signal?.removeEventListener('abort',aborted);};
    const diagnostic={at:Date.now(),transport,phase:'decoder-start',bytes:0,code:null,exit:null,signal:null,bufferMode:profile.mode,bufferLimitBytes:profile.readable+profile.writable+profile.web};let stderr='',progressLine='';
    const report=(phase,code=diagnostic.code)=>{diagnostic.phase=phase;diagnostic.code=code;diagnostic.bufferedBytes=(job.output?.readableLength||0)+(job.output?.writableLength||0);diagnostic.idleMs=Date.now()-lastBytesAt;if(entry.job===job)entry.produced=diagnostic.decodedSeconds||0;last={...diagnostic};onDiagnostic({...diagnostic});};
    job.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4096);progressLine=(progressLine+chunk.toString()).slice(-8192);const lines=progressLine.split(/\r?\n/);progressLine=lines.pop();for(const line of lines){const m=/^(out_time_us|speed|frame)=\s*([\d.]+)x?$/.exec(line);if(m){const number=Number(m[2]);if(Number.isFinite(number))diagnostic[m[1]==='out_time_us'?'decodedSeconds':m[1]==='speed'?'decoderSpeed':'decodedFrames']=m[1]==='out_time_us'?number/1e6:number;}}});
    job.on('error',error=>{report('decoder-exec-failed',decoderFailure('',error.code));stopJob(job);});
    report('decoder-start');
    job.stdin.on('error', () => {});
    const networkOptions=source?'':'option rw_timeout 15000000\noption reconnect 1\noption reconnect_on_network_error 1\noption reconnect_on_http_error 500,502,503,504\noption reconnect_max_retries 2\noption reconnect_delay_max 2\noption reconnect_delay_total_max 4\n';
    job.stdin.end(`ffconcat version 1.0\nfile ${quote(source?.url||track.url)}\n${track.key ? 'option decryption_key ' + track.key + '\n' : ''}option user_agent ${quote(UA)}\n${networkOptions}duration ${track.duration}\n`);
    job.on('close', (code,signalName) => {if(entry.job===job){entry.produced=diagnostic.decodedSeconds||0;entry.finished=!job.cancelled&&code===0;}job.cleanup();diagnostic.exit=code;diagnostic.signal=signalName;report(job.cancelled?'cancelled':'decoder-ended',!job.cancelled&&code!==0?decoderFailure(stderr,'',signalName):diagnostic.code);stderr='';if(!job.cancelled&&code!==0)job.output?.destroy(new Error('Decoder stream failed')); });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { stopJob(job); report('decoder-timeout','M106');reject(new Error('Decode startup timeout')); }, 25000);
        const finish = result => { clearTimeout(timer); job.off('error', failed); job.off('close', closed); job.stdout.off('readable', ready);job.stdout.off('close',failed);job.stdout.off('error',failed); result(); };
        const failed = () => finish(() => reject(new Error('Decoder failed')));
        const closed = () => { if (job.stdout.readableLength > 0) finish(resolve); else failed(); };
        const ready = () => { if (job.stdout.readableLength > 0) finish(resolve); };
        job.once('error', failed); job.once('close', closed); job.stdout.on('readable', ready);job.stdout.once('close',failed);job.stdout.once('error',failed);if(job.cancelled||signal?.aborted)failed();
      });
      const {output,body}=createReadAhead(profile,bytes=>{diagnostic.bytes+=bytes;lastBytesAt=Date.now();});
      job.output=output;
      // Web-stream cancellation destroys the Node readable, even when request.signal does not abort.
      output.once('close',()=>{if(!output.readableEnded)stopJob(job);});
      job.stdout.on('error',()=>output.destroy(new Error('Decoder output failed')));job.stdout.pipe(output);
      report('stream-start');if(!cleaned){pulse=setInterval(()=>report('stream-progress'),5000);pulse.unref();}return new Response(body, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Accept-Ranges': 'none' } });
    } catch { stopJob(job); return new Response('', { status: 502 }); }
  }
  function sessionToken(url){let u;try{u=new URL(url);}catch{throw new Error('播放会话无效');}const m=/^\/media\/([a-f0-9]{48})$/.exec(u.pathname);if(!m||u.origin!==origin.origin||u.host!==origin.host||u.protocol!==origin.protocol||u.username||u.password||u.search||u.hash)throw new Error('播放会话无效');return m[1];}
  function bufferState(url){const entry=sessions.get(sessionToken(url));return{exists:!!entry,finished:!!entry?.finished,decodedSeconds:Math.max(0,Math.min(7200,entry?.produced||0))};}
  function release(url) { const token=sessionToken(url),entry=sessions.get(token);if(entry?.job)stopJob(entry.job);sessions.delete(token); }
  return { create, stream, release, bufferState, close, status: () => ({ activeDecoders: jobs.size, last }) };
}
