# Thrilled

新标签页扩展，极简冷调设计。

## 当前状态

- `v3.0`：原生 TypeScript + esbuild，磁贴/分类分页、多引擎搜索、壁纸、天气、设置面板、本地目录同步、收藏夹导入。（视图层已在 v4 重构中删除，数据/平台逻辑迁入 `src/core`）
- `v4.0`：**仓库结构已落地**——React 18 + Vite + TypeScript，按「`app` 视图层 / `core` 服务层 / `background` / `shared`」分层；界面按 UiTab 实测基准复刻（`uetab.com`，见 04 文档），形态为「固定 1920 设计稿坐标系 + 60px 单元格绝对定位网格 + 横向翻页 + 风格皮肤系统 + 内容完全自定义 + 云同步 + 界面广场」。
- **内容模型**：卡片 = 对小组件定义的一次引用 `{ id, c, r, w, h, t, config }`——位置与尺寸属于布局，`config` 属于内容；添加 / 删除 / 改尺寸 / 换类型 / 改内容 / 拖动 / 整套布局导入导出全部可用。见 [02-UI规格.md](docs/v4/02-UI规格.md) §13。
- **搜索引擎**：内置 12 个主流引擎（百度 / 必应 / 谷歌 / 搜狗 / 360 / 神马 / 夸克 / 头条 / 知乎 / 微博 / DuckDuckGo / Brave）+ 自定义；搜索框左侧图标即下拉入口，支持隐藏、排序、数字键 `1`–`9` 切换。
- 风格皮肤：内置经典 / 光感 / 暗黑 / 黑紫四套仅为**出厂初始值**，用户可自定义配色（12 项令牌）、改名、新建、删除、还原。**界面风格不做任何颜色限制。**

## 目录结构

```
src/
├─ app/            React 视图层（不直接碰 chrome.*）
│  ├─ main.tsx     入口
│  ├─ App.tsx      舞台装配：搜索 / 翻页网格 / Dock / 浮层
│  ├─ store.ts     zustand：设置 · 布局 · 引擎 · 浮层
│  ├─ layout.ts    出厂布局 + 网格算法（60px / 24×10 / 六档尺寸）
│  ├─ widgets.tsx  小组件定义表（18 类）+ 渲染器
│  ├─ panels.tsx   抽屉（添加/个性化/广场/设置/我的）+ 弹窗
│  ├─ menus.tsx    右键菜单（全局 11 项 / 卡片 6 项）
│  ├─ icons.tsx    图标集
│  └─ styles/      令牌与样式（来自 docs/v4/index.html 冻结原型）
├─ core/           框架无关服务层：storage / wallpaper / file-config / favicon /
│                  export / reset / weather / quotes / countdown / greeting /
│                  search-engines / link-opener / bookmark-importer / logger / errors / utils
├─ background/     service worker（index.ts + favicon-resolver.ts）
└─ shared/         类型 · 常量 · 消息协议
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
pnpm test        # 单元测试
pnpm build       # 构建扩展 → dist/（Vite 出应用，esbuild 出 background）
pnpm release     # 打包 releases/
```

加载扩展：Chrome → `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录。