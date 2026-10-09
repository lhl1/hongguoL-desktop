# 第三方组件与公开范围

根目录 MIT 许可证覆盖本仓库自行编写的 Electron/React 重建源码、适配器源码、文档、合成测试和 `public/app.svg` 原创标识，不授予第三方组件、品牌、APK、原生库或影视内容的权利。

## JavaScript 依赖

React、React DOM、Electron、Vite、TypeScript 及构建工具通过 npm 安装，精确版本见 `package-lock.json`。各依赖的版权与许可证由其包中的 LICENSE/NOTICE 保留；Electron 生成包中的 Electron/Chromium 许可说明不得移除。

## 本地原生运行资源

本仓库不分发以下二进制，也不在 GitHub Actions 中打包它们：

- 原 APK 的 `libmetasec_ml.so`、`libEncryptor.so` 及 SDK 配置。需要用户自行提供可使用的原文件，不属于 MIT 许可范围。Android ARM JNI 通过 unidbg 在本机进程内调用，没有 Android 系统或模拟器界面。
- unidbg、Unicorn 等 JNI 适配器依赖。Maven 解析的依赖均保留其原许可证与 NOTICE。项目上游：<https://github.com/zhkl0228/unidbg>、<https://github.com/unicorn-engine/unicorn>。
- JDK/JRE。使用 JDK 17 的 jlink 生成运行时，需要保留所用发行版的 `legal` 目录及源代码/许可证信息。
- FFmpeg。由用户自行提供支持 H.264/AAC 解码、所需输入协议和输出格式的 Windows x64 构建。其配置可能启用 GPL，须遵循所选发行版对应的分发条件和源码要求；本仓库不以 MIT 覆盖 FFmpeg。上游：<https://ffmpeg.org/>。

原 APK、官方图标、字体、剧集封面、视频、捕获的网络响应与现有含专有组件的成品包不随源码发布。应用运行时可以从服务获取内容，但没有内容再分发许可，也没有服务可用性保证。
