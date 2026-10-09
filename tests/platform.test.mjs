import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {runtimePaths, nativeResources, encryptLocal} from '../electron/runtime-platform.mjs';

test('Windows and macOS use their bundled executables without system PATH fallback', () => {
  const root = path.resolve('fixture-runtime');
  assert.equal(runtimePaths(root,'win32').java,path.join(root,'jre/bin/java.exe'));
  assert.equal(runtimePaths(root,'win32').ffmpeg,path.join(root,'media/ffmpeg.exe'));
  assert.equal(runtimePaths(root,'darwin').java,path.join(root,'jre/bin/java'));
  assert.equal(runtimePaths(root,'darwin').ffmpeg,path.join(root,'media/ffmpeg'));
  assert.throws(()=>runtimePaths(root,'linux'));
});
test('development resources follow Mac host architecture, packaged paths remain private', () => {
  const directory = path.resolve('fixture/electron');
  for (const arch of ['arm64','x64']) assert.equal(nativeResources(directory,{platform:'darwin',arch}),path.resolve(directory,'../native-resources-macos',arch));
  assert.equal(nativeResources(directory,{platform:'win32'}),path.resolve(directory,'../native-resources'));
  assert.equal(nativeResources(directory,{packaged:true,resourcesPath:'/bundle/Resources',platform:'darwin',arch:'arm64'}),path.join('/bundle/Resources','apk-native'));
  assert.throws(()=>nativeResources(directory,{platform:'darwin',arch:'ia32'}));
});
test('unavailable OS encryption fails before writing or exposing plaintext', () => {
  let called = false;
  assert.throws(()=>encryptLocal({isEncryptionAvailable:()=>false,encryptString:()=>{called=true;}},'synthetic-secret'),/安全存储/);
  assert.equal(called,false);
  assert.deepEqual(encryptLocal({isEncryptionAvailable:()=>true,encryptString:()=>Buffer.from([7,8])},'synthetic-secret'),Buffer.from([7,8]));
});
