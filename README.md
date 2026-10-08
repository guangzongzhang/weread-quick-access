# 微信读书快捷访问 v2

Chrome MV3 / Edge MV3 扩展：快速访问微信读书，支持多账户管理、免扫码登录、弹窗内书架预览与搜索。

## 功能

### 核心功能

- **多账户管理**：保存多个微信读书账户，一键切换
- **免扫码自动登录**：开启后访问 weread.qq.com 自动恢复登录态，免去扫码
- **Cookie 加密存储**：仅保留登录态相关字段（白名单），AES-GCM 加密后落盘

### 书架与阅读

- **弹窗书架预览**：显示最近在读 3 本，点击直达阅读页
- **真实阅读进度**：从 `bookProgress` 数据源获取每本书的真实阅读百分比
- **阅读时长显示**：每本书旁显示累计阅读时长（如「⏱ 3小时25分」）
- **继续阅读卡片**：popup 顶部显示最近阅读的书，一键续读，附进度和时长
- **阅读看板**：设置页展示书架统计（总数 / 正在阅读 / 已读完）和书架网格
- **刷新按钮**：手动刷新书架数据，带加载状态反馈

### 搜索

- **弹窗内搜索**：回车后直接在 popup 内显示搜索结果，点击跳阅读页
- **Omnibox 搜索**：地址栏输入 `wr 书名` → 自动搜索并跳转到第一本书的阅读页
- **右键菜单**：选中任意网页文字 → 右键 → 「在微信读书搜索」
- **快捷键搜索**：`Ctrl+Shift+S`（Mac: `Cmd+Shift+S`）跳转搜索

### 其他

- **快捷键**：`Ctrl+Shift+W`（Mac: `Cmd+Shift+W`）打开弹窗
- **暗色模式**：跟随系统配色
- **i18n**：中英文双语
- **隐私说明页**：透明披露数据存储方式

## 下载安装（非开发者推荐）

1. 从 [Releases](https://github.com/guangzongzhang/weread-quick-access/releases) 下载最新版 `weread-v2.zip`
2. 解压到任意文件夹
3. 打开 `chrome://extensions`（Edge: `edge://extensions`）
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」→ 选择解压后的文件夹

## 从源码构建

```bash
npm install
npm run build
```
然后加载 `dist/` 目录。

## 开发

```bash
npm run dev
```

Vite HMR + @crxjs/vite-plugin，修改源码自动热更新扩展。

## 构建

```bash
npm run build
```

输出到 `dist/`，并打包为 `release/weread-v2.zip`。

### 加载到 Chrome / Edge

1. 访问 `chrome://extensions`（或 `edge://extensions`）
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `dist/` 目录

## 测试

```bash
npm test                # 单元测试（Vitest）
npm run test:watch      # 监听模式
```

测试覆盖：`crypto` / `cookie-store` / `account-store` / `messaging` 四个核心模块。

## 目录结构

```
weread/
├── src/
│   ├── background/service-worker.ts   # MV3 service worker
│   ├── popup/                          # 弹窗 UI + 组件
│   │   ├── popup.ts                    # 主入口
│   │   ├── popup.css                    # 样式
│   │   └── components/
│   │       ├── shelf-preview.ts         # 书架预览 + 刷新
│   │       ├── search-box.ts            # 搜索框
│   │       └── account-list.ts          # 账户列表
│   ├── options/                        # 设置页（多账户管理 + 隐私说明）
│   ├── contents/reader-enhance.ts      # 阅读页增强（解除右键限制）
│   ├── lib/
│   │   ├── api/                       # weread Web API 客户端
│   │   │   ├── weread-client.ts        # 书架同步 + 进度 + 时长
│   │   │   ├── endpoints.ts            # API 端点常量
│   │   │   └── deep-link.ts            # 阅读页 ID 提取
│   │   ├── auth/                      # crypto / cookie-store / account-store
│   │   ├── messaging/                 # popup ↔ background 类型安全消息层
│   │   ├── i18n/                      # 国际化
│   │   └── utils/                     # escape / debounce
│   └── manifest.config.ts             # @crxjs defineManifest
├── tests/                              # Vitest 单元测试
├── _locales/{zh_CN,en}/messages.json  # i18n 文案
├── public/icons/                       # 扩展图标
├── scripts/generate-icons.ts           # 图标生成脚本
├── vite.config.ts / vitest.config.ts
├── tsconfig.json / .eslintrc.cjs / .prettierrc
└── package.json
```

## 隐私承诺

1. **数据存储**：所有账户数据（Cookie、LocalStorage）仅保存在本机浏览器扩展沙箱内（`chrome.storage.local`），**不上传任何服务器**。
2. **Cookie 白名单**：仅保留微信读书登录态相关字段（`wr_vid` / `wr_skey` / `wr_rt` 等），不再全量 dump。
3. **加密存储**：Cookie 与 LocalStorage 经 AES-GCM 加密后存储；密钥同样保存在扩展沙箱内。MV3 沙箱隔离保证其他扩展无法访问本扩展存储。
4. **可控删除**：可在设置页随时删除任一或全部账户数据，操作即时生效。

### 已知限制

- **密钥与密文同库**：加密密钥与密文都存在 `chrome.storage.local`。本机其他原生进程理论上仍可读取二者。这是 MV3 沙箱内的现实约束。如需更高安全性，可后续接入 `chrome.storage.session` + 用户解锁密码派生密钥方案。
- **weread API 反爬**：若微信读书调整接口鉴权，弹窗书架预览会自动降级为快捷链接按钮（书架/笔记/发现）。

## 技术栈

- TypeScript 5 + Vite 5 + @crxjs/vite-plugin 3
- Vitest 2（单元测试）
- Web Crypto API（AES-GCM）
- webextension-polyfill（跨浏览器 API 兼容）
- Chrome Manifest V3

## License

MIT
