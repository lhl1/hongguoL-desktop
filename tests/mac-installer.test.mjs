import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const scripts=path.resolve('scripts'),bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'/bin/bash';
const posix=p=>p.replaceAll('\\','/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
function scenario(t,mode){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-install-contract-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const base=path.join(root,'bundle'),home=path.join(root,'profile'),tools=path.join(root,'tools');for(const d of [base,home,tools])fs.mkdirSync(d,{recursive:true});
 const writes={'Hongguo.app/Contents/Info.plist':'12','Hongguo.app/Contents/MacOS/Hongguo':'#!/bin/bash\n[[ "$MODE" == chromium ]] && exit 1\nexit 0\n','Hongguo.app/Contents/Resources/apk-native/media/ffmpeg':'#!/bin/bash\n[[ "$MODE" == killed ]] && exit 137\nexit 0\n','Hongguo.app/Contents/Resources/apk-native/jre/bin/java':'#!/bin/bash\nexit 0\n','Hongguo.app/Contents/Frameworks/Hongguo Helper.app/Contents/Info.plist':'helper','Hongguo.app/Contents/Frameworks/Hongguo Helper.app/Contents/MacOS/Hongguo Helper':'helper','entitlements.mac.plist':'plist','bundle-symlinks.txt':''};
 for(const [n,s]of Object.entries(writes)){const f=path.join(base,n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s);}
 for(const n of ['Resources/Info.plist','Versions/Current/F']){const f=path.join(base,'Hongguo.app/Contents/Frameworks/F.framework',n);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,'framework');}
 const old=path.join(home,'Applications/Hongguo.app/Contents');fs.mkdirSync(old,{recursive:true});fs.writeFileSync(path.join(old,'Info.plist'),'old');
 const shim=path.join(root,'shim.cjs');fs.writeFileSync(shim,String.raw`const fs=require('fs'),path=require('path'),crypto=require('crypto');const [name,...a]=process.argv.slice(2);const fix=p=>p.replace(/^\/([a-z])\//i,(_,d)=>d+':/');const last=fix(a.at(-1)||'');const log=process.env.AUDIT;fs.appendFileSync(log,JSON.stringify({name,args:a})+'\n');
 if(name==='uname')console.log(a[0]==='-s'?'Darwin':'arm64');
 else if(name==='sysctl')console.log('1');else if(name==='sw_vers')console.log('15.0');
 else if(name==='plutil'){if(a[0]==='-convert'){fs.copyFileSync(last,fix(a[a.indexOf('-o')+1]));}else console.log(a[1]==='HongguoArchitecture'?'arm64':a[1]==='CFBundleVersion'?(fs.readFileSync(last,'utf8')==='old'?'611':'612'):last.includes('.framework')?'F':last.includes('Helper')?'Hongguo Helper':'Hongguo');}
 else if(name==='xattr'){if(a[0]==='-p')process.exit(1);}
 else if(name==='ditto'){const src=fix(a.at(-2));fs.cpSync(src,last,{recursive:true});}
 else if(name==='stat')console.log(fs.statSync(last).ino);
 else if(name==='file')console.log(last.endsWith('ffmpeg')||last.endsWith('java')||last.endsWith('Hongguo')||last.endsWith('Hongguo Helper')?'Mach-O executable':'data');
 else if(name==='pgrep')process.exit(process.env.MODE==='running'?0:1);
 else if(name==='codesign'){if(a.includes('--sign')&&last.endsWith('ffmpeg'))process.exit(91);if(a.includes('--sign')&&a.includes('--deep'))process.exit(92);if(a.includes('--sign'))fs.writeFileSync(last+(fs.statSync(last).isDirectory()?'/signed-marker':'.signed-marker'),'signed');else if(!last.endsWith('ffmpeg')&&!last.endsWith('java')&&!fs.existsSync(last+(fs.statSync(last).isDirectory()?'/signed-marker':'.signed-marker')))process.exit(1);}
 else if(name==='shasum'){if(a.includes('-c')){if(process.env.MODE==='corrupt')process.exit(1);for(const line of fs.readFileSync(last,'utf8').trim().split('\n')){const [hash,rel]=line.split('  ');const bytes=fs.readFileSync(path.join(path.dirname(last),rel));if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)process.exit(1);}}else console.log(crypto.createHash('sha256').update(fs.readFileSync(last)).digest('hex')+'  '+last);}
 `);
 const used=['uname','sysctl','sw_vers','plutil','xattr','ditto','stat','file','pgrep','codesign','shasum'];
 for(const name of used)fs.writeFileSync(path.join(tools,name),`#!/bin/bash\n"${process.execPath.replaceAll('\\','/')}" "${shim.replaceAll('\\','/')}" ${name} "$@"\n`);
 const adapt=s=>s.replaceAll('$HOME','$TEST_PROFILE').replace(/\/(?:usr\/bin|usr\/sbin)\/([A-Za-z_-]+)/g,(full,name)=>used.includes(name)?`"${posix(tools)}/${name}"`:full).replace('$(uname -s)',`$(${posix(tools)}/uname -s)`).replace('$(uname -m)',`$(${posix(tools)}/uname -m)`);
 fs.writeFileSync(path.join(base,'mac-install-lib.sh'),adapt(fs.readFileSync(path.join(scripts,'mac-install-lib.sh'),'utf8')));
 fs.writeFileSync(path.join(base,'prepare.sh'),adapt(fs.readFileSync(path.join(scripts,'mac-prepare-v2.sh'),'utf8')));
 const files=[];function walk(d){for(const entry of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,entry.name);entry.isDirectory()?walk(f):files.push(f);}}walk(base);
 fs.writeFileSync(path.join(base,'bundle-SHA256SUMS.txt'),files.map(f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')+'  '+path.relative(base,f).replaceAll('\\','/')).join('\n')+'\n');
 const audit=path.join(root,'audit.jsonl');const child=spawnSync(bash,[posix(path.join(base,'prepare.sh'))],{windowsHide:true,env:{...process.env,TEST_PROFILE:posix(home),MODE:mode,AUDIT:audit},encoding:'utf8',timeout:60000});
 if(child.error)throw child.error;
 return{child,home,base,audit:fs.existsSync(audit)?fs.readFileSync(audit,'utf8').trim().split('\n').map(JSON.parse):[]};
}
test('Mac installer success preserves FFmpeg signature and signs children before parent without deep signing',{skip:!fs.existsSync(bash)},t=>{
 const x=scenario(t,'ok');assert.equal(x.child.status,0,x.child.stdout+x.child.stderr);const source=fs.readFileSync(path.join(x.base,'Hongguo.app/Contents/Resources/apk-native/media/ffmpeg'));const final=fs.readFileSync(path.join(x.home,'Applications/Hongguo.app/Contents/Resources/apk-native/media/ffmpeg'));assert.deepEqual(final,source);
 const signs=x.audit.filter(e=>e.name==='codesign'&&e.args.includes('--sign'));assert.ok(signs.length>=2);assert.ok(signs.at(-1).args.at(-1).endsWith('/Hongguo.app'));assert.ok(signs.every(e=>!e.args.includes('--deep')&&!e.args.at(-1).endsWith('/ffmpeg')));assert.ok(x.audit.filter(e=>e.name==='xattr'&&e.args.includes('-dr')).every(e=>e.args.at(-1).includes('/Applications/.Hongguo-install.')));
 const framework=signs.find(e=>e.args.at(-1).endsWith('.framework'));assert.ok(framework&&!framework.args.includes('--entitlements'));assert.ok(signs.find(e=>e.args.at(-1).endsWith('Helper.app')).args.includes('--entitlements'));
 assert.ok(fs.readdirSync(path.join(x.home,'Applications/Hongguo-backups')).length===1);
});
for(const mode of ['killed','chromium','corrupt','running'])test('Mac installer injected '+mode+' failure never replaces the old app',{skip:!fs.existsSync(bash)},t=>{
 const x=scenario(t,mode);assert.notEqual(x.child.status,0);assert.equal(fs.readFileSync(path.join(x.home,'Applications/Hongguo.app/Contents/Info.plist'),'utf8'),'old');assert.ok(!fs.existsSync(path.join(x.home,'Applications/Hongguo-backups')));if(mode==='corrupt'){assert.ok(x.audit.some(e=>e.name==='shasum'));assert.ok(!x.audit.some(e=>e.name==='ditto'));}else{assert.ok(x.audit.some(e=>e.name==='ditto'));assert.ok(x.child.stdout.includes(mode==='killed'?'decoder_launch':mode==='chromium'?'chromium_video':'existing_installation'),x.child.stdout+x.child.stderr);}
});
