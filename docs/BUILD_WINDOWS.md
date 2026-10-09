# Windows 构建说明

## 1. 源码工具

使用 Windows x64、Node.js 24、JDK 17 和 Maven 3。Java 适配器的源码目标为 17；npm 精确依赖以锁文件为准。Git for Windows 的 Bash 仅用于历史安装器合同测试，没有 Bash 时相关测试会明确跳过。

```powershell
npm ci
npm run build
npm test
```

不提供运行资源也可以完成这一步。编译界面不等于验证真实视频播放。

## 2. 本地运行资源

当前适配器对应 APK `com.phoenix.read`、7.3.9.32 / 73932。其他版本不能假定 ABI/接口兼容。本仓库没有原 APK，也没有提供它的下载地址。

自行提供：

- 可使用的原 APK，包含 `lib/arm64-v8a/libmetasec_ml.so` 和 `lib/arm64-v8a/libEncryptor.so`。
- 与此 APK 配套的 MetaSec SDK 配置数组 JSON。数组第 6、7、8、9、13 项为运行身份相关字段，准备脚本会清空；不要使用他人的设备/账号配置。配置获取和合法使用由用户自行准备，仓库不提供或硬编码该配置。
- 完整 Windows JDK 17，含 `javac.exe` 与 `jlink.exe`。
- Windows x64 FFmpeg，具备 H.264/AAC 解码、MP4 输入和流输出能力；使用前核对其来源、构建配置和许可证。
- Maven 可解析 `native-adapter/pom.xml` 的 unidbg 0.9.9 等依赖。

准备脚本只写入项目 `native-resources` 与 `native-adapter/target`。资源目录存在时拒绝覆盖；先自行备份并移开旧目录。脚本不要求管理员，不修改系统 PATH、全局代理、证书或系统主题，JAVA_HOME 仅在子进程构建期间临时使用后恢复。

```powershell
.\scripts\prepare-runtime.ps1 `
  -ApkPath 'C:\local-inputs\novelread.apk' `
  -SdkConfigPath 'C:\local-inputs\sdk-config.json' `
  -JdkHome 'C:\tools\jdk-17' `
  -FfmpegPath 'C:\tools\ffmpeg\bin\ffmpeg.exe' `
  -FfmpegNoticesDirectory 'C:\tools\ffmpeg\licenses'
```

路径为示例，需替换为自己的路径。`-MavenCommand` 可以指定 `mvn.cmd` 的完整路径。不要为了运行脚本修改全局执行策略。FFmpeg 的动态发行版还需要自行提供其同目录运行依赖；本项目原始验证使用静态 x64 构建。

资源结构：

```text
native-resources/
  libmetasec_ml.so
  libEncryptor.so
  msconfig.json
  jre/bin/java.exe
  jars/apk-native-adapter.jar
  jars/<Maven dependencies>.jar
  media/ffmpeg.exe
  media/licenses/
  local-runtime-manifest.json
```

以上整个目录已被 Git 忽略。不是公开源码的一部分；不要直接上传该目录或含它的成品包。准备脚本保留 JRE 的 legal、JAR 内部通知和用户提供的 FFmpeg 通知，但这不替代自行履行每个第三方组件的分发要求。

## 3. 运行与打包

```powershell
npm start
npm run pack
```

输出 `release-2.3.4/win-unpacked/`。发布目录不会被 Git 跟踪。要发布含第三方资源的二进制，需另行确认使用/分发条件；本次 GitHub 开源只发布源码。

## 4. 集成验证

```powershell
npm run test:live
npm run test:desktop
```

真实服务可能因版本、网络、风控或服务变化拒绝请求，失败时不能伪造游客身份或绕过授权。桌面测试隐藏、静音；只模拟窗口状态，不为了测试激活全屏窗口影响工作。

可选的本地图像集成测试：提供自己可以使用的 HEIC 测试文件，设置当前进程的 `HONGGUO_HEIC_FIXTURE` 环境变量后执行 `npm test`。不要将该样本/日志上传到仓库。
