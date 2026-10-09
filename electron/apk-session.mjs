import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runtimePaths } from './runtime-platform.mjs';
import { UA, APK, configureContext, configureRequestEnricher, parseAPKJSON } from './apk-rpc.mjs';
// The Android OS is not used: only the APK's ARM/JNI libraries run in a desktop process.
export function createNativeAdapter(resources) {
  let child, ready, sequence = 0, closed = false;
  const pending = new Map();
  function stop() { closed = true; child?.kill(); for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error('原生接口适配器已关闭')); } pending.clear(); }
  function start() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      child = spawn(runtimePaths(resources).java, ['-Xmx512m', '-cp', path.join(resources, 'jars/*'), 'local.research.ApkNativeWorker', resources], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const startup = setTimeout(() => { reject(new Error('APK 原生库初始化超时')); stop(); }, 30000);
      const fail = () => { clearTimeout(startup); reject(new Error('APK 原生接口适配器启动失败')); for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error('APK 原生接口适配器退出')); } pending.clear(); };
      child.on('error', fail); child.on('exit', fail);
      child.stderr.on('data', () => {}); // Native diagnostics can contain request material; never persist them.
      createInterface({ input: child.stdout }).on('line', line => {
        let reply; try { reply = JSON.parse(line); } catch { return; }
        if (reply.ready) { clearTimeout(startup); resolve(); return; }
        if (reply.ready === false) { clearTimeout(startup); reject(new Error('APK 原生库初始化失败：' + String(reply.error).slice(0, 60) + ' ' + String(reply.detail).slice(0, 400))); return; }
        const call = pending.get(reply.id); if (!call) return;
        clearTimeout(call.timer); pending.delete(reply.id);
        if (reply.ok) call.resolve(reply.data); else call.reject(new Error('APK 原生签名或加密调用失败'));
      });
    });
    return ready;
  }
  async function call(request) {
    if (closed) throw new Error('APK 原生接口适配器已关闭');
    await start(); const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('APK 原生接口调用超时')); stop(); }, 30000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, ...request }) + '\n', error => { if (error) { clearTimeout(timer); pending.delete(id); reject(new Error('无法调用 APK 原生接口')); } });
    });
  }
  return { call, close: stop };
}
const validGuest = value => /^\d{5,25}$/.test(value?.device_id) && /^\d{5,25}$/.test(value?.iid);
export function createApkSession({ resources, profile, fetcher = globalThis.fetch, encode = value => Buffer.from(value), decode = value => value.toString('utf8'), persistent = true, adapter = createNativeAdapter(resources), onDiagnostic = () => {}, retryDelay = ms => new Promise(resolve=>setTimeout(resolve,ms)) }) {
  let guest, preparing,closed=false;
  async function register() {
    const clientudid = randomUUID(), cdid = randomUUID();
    // z28.h$a.c, x28.w.g, a0.b and EncryptorUtil.ttEncrypt, from the supplied APK.
    const header = { aid: APK.aid, app_name: 'novelread', package: APK.package, app_version: APK.version, version_code: APK.versionCode, update_version_code: APK.versionCode, manifest_version_code: APK.versionCode, channel: '69310258a', display_name: '红果免费短剧', device_platform: 'android', os: 'Android', os_version: '9', os_api: 28, device_model: 'SM-N9810', device_brand: 'samsung', device_manufacturer: 'samsung', cpu_abi: 'arm64-v8a', density_dpi: 480, display_density: 'xhdpi', resolution: '2560x1440', language: 'zh', timezone: 8, access: 'wifi', sdk_version: '3.7.0-rc.34-fanqie-xiaoshuo', sdk_flavor: 'china', sdk_target_version: 29, git_hash: '3a88f4e', guest_mode: 0, not_request_sender: 0, clientudid, cdid, openudid: randomBytes(8).toString('hex'), req_id: randomUUID() };
    const compressed = gzipSync(Buffer.from(JSON.stringify({ magic_tag: 'ss_app_log', header, _gen_time: Date.now() })));
    const encrypted = await adapter.call({ operation: 'encrypt', body: compressed.toString('base64') });
    for(let attempt=1;attempt<=3;attempt++){
      if(closed)throw new Error('游客会话已关闭');
      const response = await fetcher('https://ib.snssdk.com/service/2/device_register/?tt_data=a&aid=8662&device_platform=android&version_code=73932', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/octet-stream;tt-data=a', 'log-encode-type': 'gzip' }, body: Buffer.from(encrypted.body, 'base64'), redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) {onDiagnostic({phase:'registration',outcome:'http',status:response.status,attempt});throw new Error(`原版游客注册失败（HTTP ${response.status}）`);}
      const raw=await response.text();
      if(raw.length>256*1024)throw new Error('游客注册响应过大');
      const data=parseAPKJSON(raw);const value = { device_id: String(data.device_id_str || data.device_id || ''), iid: String(data.install_id_str || data.install_id || ''), cdid, clientudid, createdAt: Date.now() };
      if (!validGuest(value)){onDiagnostic({phase:'registration',outcome:'invalid-id',attempt});if(attempt<3){await retryDelay(attempt*350);continue;}throw new Error('原版服务未分配有效游客编号，请稍后重试');}
      // A local encryption/write failure must not invalidate a server-accepted guest.
      guest=value;onDiagnostic({phase:'registration',outcome:'ready',attempt});
      if(persistent){
        try{const bytes=encode(JSON.stringify(value));await fs.mkdir(path.dirname(profile), { recursive: true });await fs.writeFile(profile + '.tmp', bytes); await fs.rename(profile + '.tmp', profile);}
        catch{onDiagnostic({phase:'storage',outcome:'memory-only'});}
      }else onDiagnostic({phase:'storage',outcome:'memory-only'});
      return value;
    }
  }
  async function prepare() {
    if (preparing) return preparing;
    preparing = (async () => {
      if(persistent&&!guest)try { const stored = JSON.parse(decode(await fs.readFile(profile))); if (validGuest(stored)) guest = stored; } catch { /* First installation or unreadable local profile. */ }
      if (!guest) guest = await register();
      configureContext({ origin: 'https://api5-normal-sinfonlinec.fqnovel.com', version: '', common: { device_id: guest.device_id, iid: guest.iid, cdid: guest.cdid, channel: '69310258a', os: 'android', device_type: 'SM-N9810', device_brand: 'samsung', os_version: '9', os_api: 28, dpi: 480, resolution: '1440*2560', manifest_version_code: APK.versionCode, update_version_code: APK.versionCode, host_abi: 'arm64-v8a', compliance_status: 0, player_so_load: 1, network_type: 4, ac: 'wifi', language: 'zh', minor_status: 0 } });
      return guest;
    })().catch(error => { preparing = undefined; throw error; });
    return preparing;
  }
  configureRequestEnricher(async build => {
    await prepare();
    // rpc builds again after prepare, so this request includes the new installation context.
    const request = build.rebuild();
    const signed = await adapter.call({ operation: 'sign', url: request.url, guest: { device_id: guest.device_id, iid: guest.iid }, ...(request.body === undefined ? {} : { body: Buffer.from(request.body).toString('base64') }) });
    const headers = { ...request.headers, ...signed.headers };
    if (request.body !== undefined) headers['X-SS-STUB'] = createHash('md5').update(request.body).digest('hex').toUpperCase();
    return { ...request, headers };
  });
  return { prepare, close: () => {closed=true;guest=undefined;adapter.close();} };
}
