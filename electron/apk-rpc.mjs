import { randomInt, verify } from 'node:crypto';
import {responseCookies} from './passport-transport.mjs';

// AppProperty (classes24.dex), f4 RPC initialization, de5.b security helper.
export const ORIGIN = 'https://reading.snssdk.com';
export const UA = 'com.phoenix.read/73932 (Linux; U; Android 9; zh_CN; sm-n9810)';
export const APK = Object.freeze({ package: 'com.phoenix.read', version: '7.3.9.32', versionCode: 73932, aid: 8662 });
export const ROUTES = Object.freeze({
  tabs: '/reading/bookapi/bookmall/tab/v:version/',
  plan: '/reading/bookapi/plan/v:version/',
  cell: '/reading/bookapi/bookmall/cell/change/v:version/',
  categoryFront: '/reading/bookapi/new_category/front/v:version/',
  categoryLanding: '/reading/bookapi/new_category/landing/v:version/',
  categoryFilter: '/reading/distribution/category/landpage/v1/',
  celebrityWorks: '/reading/user/celebrity/works/v:version/',
  search: '/reading/bookapi/search/tab/v:version/',
  suggest: '/reading/bookapi/search/suggest/v:version/',
  bookFields: '/reading/distribution/book_pack_fields/select_panel_series/v1/',
  detail: '/novel/player/video_detail/v1/',
  model: '/novel/player/video_model/v1/',
  multiModel: '/novel/player/multi_video_model/player/v1',
  userInfo: '/reading/user/info/v:version/',
  history: '/reading/bookapi/read_history/list/v:version/',
  historyUpdate: '/reading/bookapi/read_history/update/v:version/'
});
const key = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCNENdvSIOZac0C7NI/1Kvj/AAjWeMemUNNvx7zx2QFsCX5iKAmrZKYiP/l4fiJ7ubqcxAsGYcd2kDd+kD/XVZa7ugCKdwS+2rClR/xGpPg02wFA0Qcmsx+R8WiITw018EUBeIWMnl5XdqOsJedqbIm2rfsRPqwpl9RBOlKpIFVmQIDAQAB\n-----END PUBLIC KEY-----';
let fetcher = globalThis.fetch;
let passportFetcher;
export function configurePassportFetch(value){passportFetcher=value;}
let context = { common: {}, version: '' };
let enrich = async request => request;
let authHeaders = () => ({});
export function configureAuthHeaders(value) { authHeaders = value; }
export function isAccountAuthenticated() { const h = authHeaders(); return !!(h['X-Tt-Token'] || /(?:^|; )sessionid(?:_ss)?=/.test(h.Cookie || '')); }
export function stringifyAPKJSON(value) { return JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? JSON.rawJSON(v.toString()) : v); }
const isPost = operation => ROUTES[operation]?.startsWith('/novel/') || operation === 'historyUpdate' || operation === 'bookFields' || operation === 'categoryFilter';
let last = null;
const verified = new Set();
export function configureFetch(value) { fetcher = value; }
// Fresh local guest context and original native SDK signing; no captured device IDs or fixed signatures.
export function configureContext(value) {
  const origin = value.origin || ORIGIN;
  if (![ORIGIN, 'https://api5-normal-sinfonlinec.fqnovel.com'].includes(origin)) throw new Error('原版服务地址无效');
  context = { common: { ...value.common }, version: String(value.version ?? ''), origin };
}
export function configureRequestEnricher(value) { enrich = value; }
export function status() { return { apk: APK, source: 'apk-rpc', runtime: 'windows', onlineVerified: verified.has('tabs') && verified.has('search'), verified: [...verified], last: last && { ...last } }; }

// com.bytedance.rpc.c.j resolves :version from request parameters, defaults to empty,
// and removes the trailing slash. API-version evidence is separate from APK versionCode.
export function buildURL(operation, business = {}) {
  const template = ROUTES[operation];
  if (!template) throw new Error('不支持的原版接口');
  const saas = template.startsWith('/novel/');
  const url = new URL(saas ? template : template.replace(':version', context.version).replace(/\/$/, ''), context.origin || ORIGIN);
  const params = { aid: APK.aid, app_name: 'novelread', version_code: APK.versionCode, version_name: APK.version, device_platform: 'android', ...context.common, ...(isPost(operation) ? {} : business) };
  delete params.version;
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  return url;
}
// APK uses int64 identifiers. JavaScript must preserve them before JSON.parse rounds them.
export function parseAPKJSON(raw) {
  let output = '', quoted = false, escaped = false;
  for (let i = 0; i < raw.length;) {
    const c = raw[i];
    if (quoted) {
      output += c; i++;
      if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false;
    } else if (c === '"') { quoted = true; output += c; i++; }
    else if (c === '-' || /[0-9]/.test(c)) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(i));
      if (!match) throw new Error('原版接口返回无效 JSON');
      const token = match[0];
      output += /^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token)) ? JSON.stringify(token) : token;
      i += token.length;
    } else { output += c; i++; }
  }
  return JSON.parse(output);
}
async function readBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('原版接口响应过大'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function rpc(operation, business = {}) {
  const nonce = `${Date.now()}-${randomInt(0, 2147483647)}`;
  const rebuild = () => ({ url: buildURL(operation, business).href, headers: { 'User-Agent': UA, 'X-Xs-From-Web': '0', Accept: 'application/json', 'sdk-version':'2', 'passport-sdk-version':'5051452', 'x-reading-request': nonce, ...authHeaders() }, ...(isPost(operation) ? { method: 'POST', body: stringifyAPKJSON(business) } : {}) });
  let request = await enrich({ ...rebuild(), rebuild });
  const url = new URL(request.url);
  if (url.origin !== buildURL(operation, business).origin || url.pathname !== buildURL(operation, business).pathname) throw new Error('请求适配器改变了原版接口地址');
  let response;
  try { response = await fetcher(url.href, { method: request.method || 'GET', body: request.body, headers: { ...request.headers, ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
  catch { last = { operation, at: Date.now(), outcome: 'network-error' }; throw new Error('无法连接原版服务，请检查网络后重试'); }
  const body = await readBody(response);
  last = { operation, at: Date.now(), http: response.status, bytes: body.length, outcome: 'received' };
  if (!response.ok) throw new Error(`原版服务返回 HTTP ${response.status}`);
  if (!body.length) { last.outcome = 'empty-response'; throw new Error('原版服务返回空响应，设备注册与请求鉴权尚未完成移植'); }
  const signature = response.headers.get('x-reading-response');
  if (signature && (response.headers.get('x-reading-request') !== nonce || !verify('RSA-SHA256', Buffer.concat([Buffer.from(nonce), body]), key, Buffer.from(signature, 'base64')))) {
    last.outcome = 'integrity-error'; throw new Error('原版响应校验失败');
  }
  let data;
  try { data = parseAPKJSON(body.toString('utf8')); } catch { last.outcome = 'invalid-json'; throw new Error('原版接口响应格式无效'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('原版接口响应格式无效');
  if (data.code === undefined) throw new Error('原版响应缺少业务状态');
  last.code = data.code;
  if (Number(data.code) !== 0) {
    last.outcome = 'business-error';
    // Do not echo arbitrary service text, which may include identifying parameters.
    throw new Error(Number(data.code) === 100103 ? '原版接口参数校验失败（100103），请求上下文仍在移植' : `原版接口暂不可用（${String(data.code).slice(0, 16)}）`);
  }
  verified.add(operation); last.outcome = 'success'; return data;
}
// Passport SDK gg1.d / x.d / fh1.g / impl.c.h. This is not a website login.
export async function passportRequest(operation, fields = {}) {
  const paths = { sendCode: '/passport/mobile/send_code/v1/', login: '/passport/mobile/sms_login/', info: '/passport/account/info/v2/' };
  if (!Object.hasOwn(paths, operation)) throw new Error('账号操作无效');
  const rebuild = () => {
    const url = buildURL('search'); url.hostname = 'security.snssdk.com'; url.pathname = paths[operation];
    url.searchParams.set('passport-sdk-version','5051452');
    const headers={'User-Agent':UA,Accept:'application/json','sdk-version':'2','passport-sdk-version':'5051452',...authHeaders()};
    if (operation === 'info') { url.searchParams.set('scene','login'); return { url: url.href, method: 'GET', headers }; }
    return { url: url.href, method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, account_sdk_source: 'app', passport_support_flow: '' }).toString() };
  };
  const request = await enrich({ ...rebuild(), rebuild });
  const url = new URL(request.url);
  if (url.hostname !== 'security.snssdk.com' || url.pathname !== paths[operation]) throw new Error('账号接口地址无效');
  let response;
  try { response = await (passportFetcher||fetcher)(url.href, { method: request.method, headers: request.headers, body: request.body, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('无法连接登录服务，请稍后重试'); }
  const body = await readBody(response);
  if (!response.ok || !body.length) throw new Error(`登录服务暂不可用（HTTP ${response.status}）`);
  let data; try { data = parseAPKJSON(body.toString('utf8')); } catch { throw new Error('登录服务响应无效'); }
  return { data, cookies: responseCookies(response.headers), token: response.headers.get('x-tt-token') || '' };
}
