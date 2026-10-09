import { spawn } from 'node:child_process';
import path from 'node:path';
import { runtimePaths } from './runtime-platform.mjs';
import { safeImage } from './apk-models.mjs';
import { UA } from './apk-rpc.mjs';
export function createImageBroker(resources, fetcher = globalThis.fetch) {
  const cache = new Map(), pending = new Map(), jobs = new Set(); let total = 0;
  async function load(url) {
    const old = cache.get(url); if (old && old.expires > Date.now()) return old;
    const response = await fetcher(url, { headers: { 'User-Agent': UA }, redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('图片服务暂不可用');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('图片过大'); } chunks.push(value); }
    let data = Buffer.concat(chunks), type = response.headers.get('content-type')?.split(';')[0];
    if (!['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif'].includes(type)) throw new Error('图片格式无效');
    if (['image/heic','image/heif'].includes(type)) {
      data = await new Promise((resolve, reject) => {
        // Some HEIC layouts put image data before metadata and need backwards seeks.
        // FFmpeg's bounded input is at most 5 MiB; cache: makes stdin seekable.
        const job = spawn(runtimePaths(resources).ffmpeg, ['-v','error','-threads','1','-read_ahead_limit','-1','-i','cache:pipe:0','-frames:v','1','-vf','scale=800:800:force_original_aspect_ratio=decrease','-f','image2pipe','-vcodec','png','pipe:1'], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
        jobs.add(job); const output = []; let count = 0;
        const timer = setTimeout(() => { job.kill(); reject(new Error('图片解码超时')); }, 10000);
        job.stdout.on('data', b => { count += b.length; if (count > 5 * 1024 * 1024) job.kill(); else output.push(b); });
        job.stderr.on('data', () => {}); job.stdin.on('error', () => {});
        job.on('error', () => { clearTimeout(timer); jobs.delete(job); reject(new Error('图片解码失败')); });
        job.on('close', code => { clearTimeout(timer); jobs.delete(job); if (code === 0 && count > 0 && count <= 5 * 1024 * 1024) resolve(Buffer.concat(output)); else reject(new Error('图片解码失败')); });
        job.stdin.end(data);
      }); type = 'image/png';
    }
    if (old) { total -= old.data.length; cache.delete(url); }
    while (cache.size && (cache.size >= 80 || total + data.length > 24 * 1024 * 1024)) { const first = cache.keys().next().value; total -= cache.get(first).data.length; cache.delete(first); }
    const entry = { data, type, expires: Date.now() + 5 * 60000 }; cache.set(url, entry); total += data.length; return entry;
  }
  return { async handle(url) {
    const source = safeImage(url); if (!source) return new Response('', { status: 403 });
    try { if (!pending.has(source)) pending.set(source, load(source).finally(() => pending.delete(source))); const result = await pending.get(source); return new Response(result.data, { headers: { 'Content-Type': result.type, 'Cache-Control': 'private, max-age=300' } }); }
    catch { return new Response('', { status: 502 }); }
  }, close() { for (const job of jobs) job.kill(); jobs.clear(); cache.clear(); }, status: () => ({ entries: cache.size, bytes: total }) };
}
