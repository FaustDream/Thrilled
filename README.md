# Thrilled

新标签页扩展，极简冷调设计。

## 当前状态

- `v4.1`：**v4 功能重构完成**——React 18 + Vite + TypeScript，按「`app` 视图层 / `core` 服务层 / `background` / `shared`」分层；界面按 UiTab 实测基准复刻（`uetab.com`，见 04 文档），形态为「固定 1920 设计稿坐标系 + 60px 单元格绝对定位网格 + 横向翻页 + 风格皮肤系统 + 内容完全自定义 + 界面广场」。
- **内容模型**：卡片 = 对小组件定义的一次引用 `{ id, c, r, w, h, t, config }`——位置与尺寸属于布局，`config` 属于内容；添加 / 删除 / 改尺寸 / 换类型 / 改内容 / 拖动 / 整套布局导入导出全部可用。见 [02-UI规格.md](docs/v4/02-UI规格.md) §13。
- **本地持久化（4.1 新增）**：设置 / 布局 / 引擎 / 皮肤 / 搜索历史整存整取到 `chrome.storage.local`（浏览器开发预览回退 localStorage），改动防抖落盘；支持 v3 数据一次性迁移（磁贴 → 网址图标、引擎顺序、搜索历史、昵称等）。
- **搜索引擎**：内置 12 个主流引擎（百度 / 必应 / 谷歌 / 搜狗 / 360 / 神马 / 夸克 / 头条 / 知乎 / 微博 / DuckDuckGo / Brave）+ 自定义；搜索框左侧图标即下拉入口，支持隐藏、拖拽排序、数字键 `1`–`9` 切换。
- **风格皮肤**：内置经典 / 光感 / 暗黑 / 黑紫四套仅为**出厂初始值**，12 项取色编辑器可自定义配色、改名、新建、删除、还原。**界面风格不做任何颜色限制。**
- **壁纸**：内置 7 张分类壁纸（极简 / 风景 / 动漫 / 更多）+ 本地上传（图片压缩 1920px）+ 外链上传 + 视频壁纸（mp4 / webm），二进制存 IndexedDB，文档只存引用。
- **真实数据**：天气卡接 Open-Meteo 实况（30min 缓存，定位超时降级北京）；搜索 / 卡片 / Dock / 导航点击经 `core/link-opener` 按打开方式设置真实跳转。
- **五面板 + 九弹窗**：添加（小组件 / 网址导航分类 / 自定义+图标上传+文件夹）、个性化（壁纸 / 透明度 / 玻璃质感 6 条 / 遮罩 / 时间日期 / 显隐 / 搜索框 / Dock / 皮肤编辑器）、广场（大厅 / 分享 / 我的，云端待接入）、设置（引擎 / 搜索框 / 问候 / 打开方式 / 数据与备份 / 账号 / 关于 / 快捷键）、我的；欢迎选风格 / 引擎管理 / 添加引擎 / 更新记录 / 关于 / 登录 / 备份 / 恢复 / 一键重置弹窗齐备，重置类操作均二次确认。
- **v3 能力接回**：收藏夹导入（书签树 → 网址图标）、本地目录同步（File System Access，数据写盘 / 恢复）、导出导入布局 JSON、快捷键（`1–9` / `←→` / `Ctrl+Shift+E` 导出 / `Ctrl+Shift+R` 重置）。

## 目录结构

```
src/
├─ app/            React 视图层（不直接碰 chrome.*）
│  ├─ main.tsx     入口（装配 platform 平台注入）
│  ├─ App.tsx      舞台装配：搜索 / 翻页网格 / Dock / 模式胶囊 / 浮层
│  ├─ store.ts     zustand：设置 · 布局 · 引擎 · 皮肤 · 持久化（hydrate/scheduleSave）
│  ├─ layout.ts    出厂布局 + 导入归一化（栅格算法在 shared/grid）
│  ├─ widgets.tsx  小组件渲染器（定义表在 shared/widget-defs）
│  ├─ panels.tsx   抽屉（添加/个性化/广场/设置/我的）+ 弹窗 + 皮肤编辑器
│  ├─ menus.tsx    右键菜单（全局 11 项 / 卡片 6 项）
│  ├─ brands.ts    品牌色字形 + 站点 URL 注册表
│  ├─ platform.ts  core 层 UI 回调注入（file-config 等）
│  ├─ icons.tsx    图标集
│  └─ styles/      令牌与样式（来自 docs/v4/index.html 冻结原型）
├─ core/           框架无关服务层：storage（v4 文档 + kv）/ wallpaper（IndexedDB）/
│                  file-config / favicon / export / reset / migrate（v3→v4）/
│                  weather / quotes / search 链接打开 / bookmark-importer / logger / errors / utils
├─ background/     service worker（index.ts + favicon-resolver.ts）
└─ shared/         类型 · 常量 · 默认值（皮肤/设置）· 网格算法 · 小组件定义表 · 消息协议
```

**分层铁律**：`core/` 与 `background/` 不 import React；`app/` 不直接调用 `chrome.*`，一律经 `core/`。

## v4 前期准备文档

| 文档 | 内容 |
| --- | --- |
| [docs/v4/04-uitab功能测绘.md](docs/v4/04-uitab功能测绘.md) | **复刻基准**：UiTab 真实 DOM 实测 + 生产包源码文案取证（布局引擎、卡片坐标与尺寸、小组件 19 类、右键菜单 11 项、四面板全文、三模式与多页规则、隐私模式行为、搜索引擎上限、取证边界） |
| [docs/v4/01-技术方案.md](docs/v4/01-技术方案.md) | 技术选型、服务拆分、鉴权复用、同步模型、API 契约、数据模型、部署、风险、分期 |
| [docs/v4/02-UI规格.md](docs/v4/02-UI规格.md) | 三模式、布局引擎、组件树、小组件契约、**内容模型（§13）**、风格皮肤系统与壁纸、右键菜单、设计令牌、交互 |
| [docs/v4/03-待办与未实现.md](docs/v4/03-待办与未实现.md) | 分期排期、待决策项、明确不做的事、已知技术债 |
| [docs/v4/index.html](docs/v4/index.html) | 可交互高保真 UI 原型（单文件，浏览器直接打开，是 v4 的视觉与交互基准） |
| [docs/v4/index-uitab.html](docs/v4/index-uitab.html) | 复刻版存档：内容逐格按 UiTab 实测坐标摆放，用于对照 |

## 开发

```bash
pnpm install
pnpm dev         # Vite 开发服务器（浏览器直接预览界面）
pnpm typecheck   # 类型检查
pnpm test        # 单元测试（layout / guards / bookmarks）
pnpm build       # 构建扩展 → dist/（Vite 出应用，esbuild 出 background）
pnpm release     # 打包 releases/
```

加载扩展：Chrome → `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录。

## 待接入（后续版本）

- 云同步与界面广场服务端（`thrilled-server`，见 01 §5–§8）；当前登录为本地演示，广场为种子模板示意
- 新闻热点真实数据源（03 文档 B2：一期静态占位）
- 音乐播放器音源（03 文档 B7）
