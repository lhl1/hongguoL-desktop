import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
if(process.platform!=='win32')throw new Error('The supported release target is Windows x64. Source build and contract tests can run separately.');
const required=['libmetasec_ml.so','libEncryptor.so','msconfig.json','jre/bin/java.exe','jars/apk-native-adapter.jar','media/ffmpeg.exe'];
const missing=required.filter(name=>!fs.existsSync(path.join(root,'native-resources',name)));
if(missing.length)throw new Error('Local runtime resources are missing: '+missing.join(', ')+'. See docs/BUILD_WINDOWS.md.');
const config=JSON.parse(fs.readFileSync(path.join(root,'native-resources/msconfig.json'),'utf8'));
if(!Array.isArray(config)||![6,7,8,9,13].every(i=>config[i]===''))throw new Error('SDK configuration must not contain captured guest/account fields.');
console.log('Local runtime resources are present; no values were printed.');
