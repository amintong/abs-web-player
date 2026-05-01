# Audiobookshelf iOS Web Player

一个专为 iOS 优化的 Audiobookshelf 有声书 Web 播放器，纯前端 PWA，支持锁屏播放、片头片尾跳过、睡眠模式。

## 功能特性

- **流媒体播放** - 直接从 Audiobookshelf 服务器流式播放
- **章节导航** - 章节列表、快速切换（点击标题弹出选择器）
- **片头片尾跳过** - 自动或手动跳过，支持按书单独配置
- **快进/快退** - 自定义秒数（设置页配置）
- **睡眠模式** - 15/30/45/60 分钟，或当前章节结束
- **播放倍速** - 0.5x - 3x
- **进度同步** - 与服务器双向同步（多设备恢复）
- **iOS 锁屏控制** - 锁屏界面显示封面、播放进度、控制按钮
- **PWA** - 可添加到主屏幕，全屏沉浸体验
- **后台播放** - 切换应用或锁屏后继续播放
- **版本管理** - 新版本发布后自动刷新

## 快速开始

### 开发环境

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入服务器信息

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

访问 http://localhost:5173

### 生产构建

```bash
npm run build
```

构建产物在 `dist/` 目录，可部署到任意静态服务器。

## 部署到 GitHub Pages

本项目为纯前端 SPA，可直接部署到 GitHub Pages。

### 方式一：手动部署

```bash
npm run build
# 将 dist/ 目录上传到 GitHub Pages
```

## 版本管理

> **重要：每次 push 到 main 分支必须更新 `public/VERSION` 文件中的版本号**（格式：`X.Y.Z`），CI 会校验版本号必须递增，否则构建失败。版本号用于 Git Tag 打标和 PWA 版本检测。

### 发布流程

```bash
# 1. 更新版本号
echo "0.7.1" > public/VERSION

# 2. 提交并推送
git add public/VERSION
git commit -m "release v0.7.1"
git push origin main   # 自动触发 CI/CD → 构建 → 部署到 Pages
```

### 方式二：CI/CD 自动部署（推荐）

1. 推送代码到 GitHub 仓库的 `master` 分支
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 添加以下 Secrets：
   - `ABS_SERVER` - 服务器地址
   - `ABS_USERNAME` - 用户名
   - `ABS_PASSWORD` - 密码
3. 在 GitHub 仓库 Settings → Pages 设置 Source 为 "GitHub Actions"
4. 推送 `master` 分支会自动触发部署

**注意：** 如果不在 CI 中注入 Secrets，用户也可以在登录页手动录入服务器信息。

## 安全说明

| 风险项 | 说明 | 缓解措施 |
|--------|------|----------|
| .env 凭据泄露 | `.env` 含服务器密码 | 已加入 `.gitignore`，不会提交到仓库 |
| 构建产物含凭据 | Vite 会将 `VITE_*` 编译进 JS | CI 中通过 GitHub Secrets 注入，本地构建请勿上传 `dist/` |
| Token 在 URL 中 | 音频/封面 URL 带 `?token=` | HTML5 `<audio>` 限制，无法使用 Header 认证 |
| 密码本地存储 | 历史密码经 base64 编码存 localStorage | 非真正加密，但防止明文直接暴露 |

> **纯前端架构**：本项目无后端代理，所有 API 调用直接由浏览器发往 Audiobookshelf 服务器（需服务端配置 CORS）。无服务器端代码意味着没有服务端漏洞可被利用。

## 架构说明

```
浏览器 (PWA) ──CORS──→ Audiobookshelf 服务器
     │                        │
     │  localStorage 持久化    │ nginx 配置跨域
     │  token/server/username  │
     └─────────────────────────┘
```

所有逻辑在前端完成：
- API 调用通过 `Authorization: Bearer` Header 认证
- 音频流因 `<audio>` 标签限制，通过 `?token=` 参数传递
- 状态通过 Zustand persist 持久化到 localStorage
- Service Worker 缓存静态资源，新版本自动更新

## 技术栈

- **React 19** + **TypeScript**
- **Vite 6** + **Vite PWA Plugin**
- **Tailwind CSS**
- **Zustand**（状态管理）
- **React Router**（路由）
- **Lucide React**（图标）
- **Workbox**（PWA Service Worker）

## iOS 使用提示

1. **添加到主屏幕**: Safari → 分享按钮 → 添加到主屏幕
2. **锁屏播放**: 播放后按 Home 键或锁屏，锁屏界面可控
3. **后台播放**: 切换到其他应用，音频继续播放

## License

MIT
