import fs from 'node:fs/promises';
import path from 'node:path';
import { configureAuthHeaders, passportRequest, rpc } from './apk-rpc.mjs';
import { id, safeImage } from './apk-models.mjs';
import {splitSetCookies} from './passport-transport.mjs';
export const xorAccount = value => Buffer.from(String(value),'utf8').map(v=>v^5).toString('hex');
export function cloudHistory(raw) {
  const data = raw?.data; if (!Array.isArray(data?.data_list)) throw new Error('云端记录格式尚未适配');
  const items = [];
  for (const v of data.data_list) {
    if (Number(v.book_type) !== 2 || v.is_delete) continue;
    try { const item = { id: id(v.book_id_str || v.book_id), title: String(v.book_name || '').slice(0,150), cover: safeImage(v.thumb_url), intro: '', episodes: Number(v.episode_cnt) || 0, episodeText: '', tags: [], episode: Number(v.vid_index), seconds: Number(v.current_play_position) / 1000, updatedAt: Number(v.read_timestamp_ms) };
      if (item.title && item.episode >= 1 && Number.isFinite(item.seconds) && Number.isFinite(item.updatedAt)) items.push(item);
    } catch {}
  }
  return { items, hasMore: !!data.has_more, nextOffset: Number(data.next_offset) || 0 };
}
export function createAccount({ folder, encode, decode, getStore, detail, onChange, request = passportRequest, reading = rpc, autoLoad = true }) {
  const file = path.join(folder,'account-v1.bin'); let state = null, jar = new Map(), retryAt = 0, busy = null, syncState = { state: 'idle', at: 0 };
  const info = () => ({ loggedIn: !!state, user: state ? { userId: state.userId, name: state.name } : null, retryAt, sync: { ...syncState } });
  const headers = () => ({ ...(jar.size ? { Cookie: [...jar].map(([k,v])=>`${k}=${v}`).join('; ') } : {}), ...(state?.token ? { 'X-Tt-Token': state.token } : {}), ...(jar.get('passport_csrf_token') ? { 'x-tt-passport-csrf-token': jar.get('passport_csrf_token') } : {}) });
  configureAuthHeaders(headers);
  async function save() { if (state) { await fs.mkdir(folder,{recursive:true}); await fs.writeFile(file+'.tmp',encode(JSON.stringify({...state,cookies:[...jar]}))); await fs.rename(file+'.tmp',file); } }
  function receive(result) {
    for (const cookie of splitSetCookies(result.cookies||[])) { const first = cookie.split(';')[0]; const split = first.indexOf('='); if (split > 0 && first.length < 8192) {const name=first.slice(0,split),value=first.slice(split+1);if(value)jar.set(name,value);else jar.delete(name);} }
    const raw = result.data, code = raw?.data?.error_code ?? raw?.error_code ?? raw?.code;
    if ((code !== undefined && Number(code) !== 0) || !(raw?.message === 'success' || (raw?.message===undefined&&Number(code)===0))) {
      const errorCode = Number(code) || -1;
      if (raw?.data?.verify_center_decision_conf || raw?.data?.verify_ticket || [1105,1107,1115,2004].includes(errorCode)) throw new Error(`登录需要原版安全验证，当前桌面版尚不能完成（${errorCode}）`);
      if(errorCode===1203)throw new Error('验证码已失效、已使用或未通过验证（1203），请重新获取验证码后登录');
      throw new Error(`登录服务未通过验证（${errorCode}），请检查手机号与验证码后重试`);
    }
    return raw.data;
  }
  const phone = value => { if (typeof value !== 'string' || !/^1[3-9]\d{9}$/.test(value)) throw new Error('请输入有效的11位手机号'); return '+86'+value; };
  return {
    async init() { if(!autoLoad)return info();try { const saved = JSON.parse(decode(await fs.readFile(file))); if (/^\d{5,25}$/.test(saved.userId) && (saved.token || saved.cookies?.some(([k])=>['sessionid','sessionid_ss','sid_tt'].includes(k)))) { state = saved; jar = new Map(saved.cookies || []); onChange?.(state.userId); } } catch {} return info(); },
    info,
    async sendCode(value) { if (Date.now() < retryAt) throw new Error('请等待验证码发送间隔结束'); const mobile = phone(value); retryAt = Date.now()+60000; const data = receive(await request('sendCode',{mobile:xorAccount(mobile),type:xorAccount('24'),unbind_exist:xorAccount('1'),mix_mode:'1',auto_read:'0',is6Digits:'1'})); retryAt=Date.now()+Math.max(30,Math.min(180,Number(data?.retry_time)||60))*1000; return info(); },
    async login(value, code) {
      const mobile = phone(value); if (typeof code !== 'string' || !/^\d{4,8}$/.test(code)) throw new Error('请输入有效的短信验证码');
      const previousState=state,previousCookies=new Map(jar);
      try{
      const result = await request('login',{mobile:xorAccount(mobile),code:xorAccount(code),mix_mode:'1'}); const data = receive(result); const uid = String(data?.user_id_str || data?.user_id || data?.uid || '');
      if(/^\d{5,25}$/.test(uid)&&!(result.token||jar.has('sessionid')||jar.has('sessionid_ss')||jar.has('sid_tt'))&&/^[A-Za-z0-9._~-]{16,1024}$/.test(data?.session_key||'')){
        const prior=new Map(jar);jar.set('sessionid',data.session_key);
        try{const confirmed=receive(await request('info'));if(String(confirmed?.user_id_str||confirmed?.user_id||confirmed?.uid||'')!==uid)throw new Error('登录会话未能确认，请重新获取验证码后登录');}catch(error){jar=prior;throw error;}
      }
      if (!/^\d{5,25}$/.test(uid) || !(result.token || jar.has('sessionid') || jar.has('sessionid_ss') || jar.has('sid_tt'))) throw new Error('登录返回缺少有效会话，尚未登录');
      state = { userId: uid, name: String(data.name || data.screen_name || data.nick_name || '红果用户').slice(0,80), token: result.token, createdAt: Date.now() };
      await save(); onChange?.(uid); syncState={state:'idle',at:0}; return info();
      }catch(error){state=previousState;jar=previousCookies;throw error;}
    },
    async logout() { state=null;jar.clear(); syncState={state:'idle',at:0}; await fs.rm(file,{force:true}); onChange?.(null); return info(); },
    async sync() {
      if (!state) throw new Error('请先登录红果账号'); if (busy) return busy;
      busy=(async()=>{
        syncState={state:'syncing',at:Date.now()}; const accountState=state,userId = state.userId;
        // APK AcctManager$o stores InfoData.userId as encodeUserId, separately
        // from Passport's numeric userId. Never compare the two namespaces.
        const confirmed=await request('info');
        if(state!==accountState)throw new Error('同步期间账号已改变');
        const identity=receive(confirmed);
        if(String(identity?.user_id_str||identity?.user_id||identity?.uid||'')!==userId)throw new Error('账号会话已失效，请重新登录');
        if(confirmed.token)state.token=confirmed.token;
        const user = await reading('userInfo',{}); const readingId = String(user.data?.user_id_str || user.data?.user_id || '');
        if(state!==accountState)throw new Error('同步期间账号已改变');
        if(!readingId||readingId==='0')throw new Error('阅读接口尚未确认登录状态，请稍后重试');
        if(/^\d+$/.test(readingId)?readingId!==userId:!/^[A-Za-z0-9+/#._~=-]{16,512}$/.test(readingId))throw new Error('阅读账号信息格式尚未适配，请稍后重试');
        if(state.readingUserId&&state.readingUserId!==readingId)throw new Error('阅读接口账号与已确认会话不一致，请重新登录');
        state.readingUserId=readingId;
        let offset=0; const remote=[];
        for (let page=0;page<10;page++) { const data=cloudHistory(await reading('history',{book_type:2,limit:50,offset,last_min_read_timestamp_ms:0,full_field:true,is_first_load:page===0,query_soft_deleted:false})); remote.push(...data.items); if (!data.hasMore) break; if (data.nextOffset<=offset) throw new Error('云端记录分页无效'); offset=data.nextOffset; if(page===9) throw new Error('云端记录超过本次同步范围，请稍后重试'); }
        if (state?.userId!==userId) throw new Error('同步期间账号已改变');
        const store=getStore(), local=store.read().history;
        const updates=local.filter(v=>!remote.some(r=>r.id===v.id&&r.updatedAt>=v.updatedAt)); let uploaded=0;
        for (let i=0;i<updates.length;i+=20) {
          const update_datas=[];
          for(const v of updates.slice(i,i+20)) { const d=await detail(v.id); const e=d.episodeList.find(e=>e.number===v.episode); if(!e||!/^\d+$/.test(e.videoId)) throw new Error('该剧集的云端进度格式尚未适配'); update_datas.push({book_id:BigInt(v.id),book_type:2,is_delete:false,read_timestamp_ms:v.updatedAt,current_play_position:Math.round(v.seconds*1000),player_accumulate_total_time:0,vid_index:v.episode,vid:BigInt(e.videoId),is_listen_mode:false}); }
          if (state?.userId!==userId) throw new Error('同步期间账号已改变');
          const result=await reading('historyUpdate',{update_datas}); if (result.data?.update_fail_datas?.length) throw new Error('部分观看记录未被服务端接受'); uploaded+=update_datas.length;
        }
        const library=store.mergeHistory(remote); syncState={state:'success',at:Date.now(),downloaded:remote.length,uploaded}; await save(); return {account:info(),library};
      })().catch(error=>{syncState={state:'error',at:Date.now(),message:error.message};throw error;}).finally(()=>{busy=null;});return busy;
    }
  };
}
