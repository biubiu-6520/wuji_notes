# 雾记 · iOS 安装说明

iOS 提供两种安装方式，**推荐方式一（无需 Mac）**。

## 方式一：PWA 安装（推荐，无需 Xcode / Mac）

Web 版本身已按 PWA 配置（manifest、图标、全屏 meta）。只要把它部署到一个 https 地址：

1. 用任意静态托管把项目根目录的 `www/` 发布出去（GitHub Pages、Vercel、Netlify、腾讯云静态托管均可）。
   - GitHub Pages：进入仓库 Settings → Pages → Source 选 `main` 分支 `/root` 或 `/docs`，若选 root 需把 `www/` 内容放到仓库根或配置发布目录。
2. iPhone 用 **Safari** 打开该 https 地址。
3. 点底部「分享」→「添加到主屏幕」。
4. 桌面会出现「雾记」图标，点开即全屏运行，与原生 App 体验一致，功能完整（含录音、相机）。

> 注意：必须用 Safari，且链接为 https（PWA 与麦克风需要安全上下文）。

## 方式二：Xcode 构建原生 App（需要 Mac）

`ios/Wuji/` 目录是 SwiftUI + WKWebView 壳工程源码：

```
ios/Wuji/
├── WujiApp.swift          # App 入口
├── ContentView.swift      # WKWebView 容器
├── Info.plist             # 权限描述（相机/麦克风/相册）
├── Assets.xcassets/       # 应用图标资源位
└── www/                   # 与 Android 一致的 Web 应用
```

构建步骤：

1. 在 Mac 上打开 Xcode → Create a new project → iOS → App。
   - Product Name：`雾记`；Interface：`SwiftUI`；Language：`Swift`；Bundle ID：`com.wuji.notes`。
2. 把 `ios/Wuji/` 里的 `WujiApp.swift`、`ContentView.swift`、`Info.plist`、`Assets.xcassets`、`www/` 拖入新建工程（勾选 Copy items if needed、Create folder references for `www`）。
3. 在 TARGETS → Signing & Capabilities 选择你的 Apple ID 团队（个人免费账号即可真机调试，签名有效期 7 天）。
4. 选择你的 iPhone 作为运行目标，点 ▶ 运行即可安装到手机。

### 说明
- 原生壳用 `file://` 加载包内 `www`，本地存储（IndexedDB）可用；录音/相机权限由 `Info.plist` 描述并在使用时系统弹窗授权。
- 若你更看重录音等需要安全上下文的能力，优先用方式一（PWA + https）。
- `Assets.xcassets/AppIcon.appiconset` 可放入 `www/icons/icon-180.png` 等作为 iOS 图标。

## 功能一致性
Android 与 iOS 共用同一套 `www/` Web 源码，功能（灵感/分组/月度总结/雾化背景/录音/视频/相机）完全一致。
