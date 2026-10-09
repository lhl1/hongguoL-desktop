import path from 'node:path';

export function runtimePaths(resources, platform = process.platform) {
  if (!['win32', 'darwin'].includes(platform)) throw new Error('当前系统尚未适配');
  return {
    java: path.join(resources, 'jre', 'bin', platform === 'win32' ? 'java.exe' : 'java'),
    ffmpeg: path.join(resources, 'media', platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  };
}

export function nativeResources(directory, {packaged = false, resourcesPath, platform = process.platform, arch = process.arch} = {}) {
  if (!['win32', 'darwin'].includes(platform)) throw new Error('当前系统尚未适配');
  if (platform === 'darwin' && !['arm64', 'x64'].includes(arch)) throw new Error('macOS 芯片架构尚未适配');
  return packaged ? path.join(resourcesPath, 'apk-native') : platform === 'darwin'
    ? path.resolve(directory, '../native-resources-macos', arch)
    : path.resolve(directory, '../native-resources');
}

export function encryptLocal(safeStorage, text) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储暂不可用，请解锁当前用户的安全存储后重试');
  return safeStorage.encryptString(text);
}
