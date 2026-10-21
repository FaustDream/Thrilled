/**
 * 小组件定义表（内容模型的唯一来源，冻结于 docs/v4/02-UI规格.md §13.1）
 *
 * 定义决定：显示名 / 字形 / 品牌色 / 默认单位尺寸 / 可编辑字段 / 默认配置
 * 实例决定：位置与尺寸（布局）+ config（内容）
 * 纯数据无 React 依赖 → app（渲染 / 编辑弹窗）与 core（导入校验 / 迁移）共用。
 */
import type { WidgetDefinition, WidgetKind, WidgetSize } from './types';
import { CELL, INSET, groupFits, insetOf } from './grid';

export const WIDGET_DEFS: Record<WidgetKind, WidgetDefinition> = {
  clock: {
    t: 'clock', n: '时钟', g: '钟', c: '#3B82F6', s: '大号数字时间，可切换 12/24 小时', units: { w: 4, h: 4 },
    /* 44px 的「13:07」约 105px 宽：宽 2 格（98px）会把时间裁掉，故宽度下限 4 格 */
    min: { w: 4, h: 2 },
    fields: [
      { k: 'timeMode', l: '时间显示', t: 'sel', o: ['24 小时', '12 小时', '隐藏'] },
      { k: 'showDate', l: '显示日期', t: 'bool' },
      { k: 'showSeconds', l: '显示秒数', t: 'bool' },
    ],
    def: { timeMode: '24 小时', showDate: true, showSeconds: false },
  },
  cal: {
    t: 'cal', n: '日历', g: '历', c: '#0EA5E9', s: '阳历农历 + 节日宜忌 + 日程', units: { w: 4, h: 4 }, min: { w: 4, h: 2 },
    fields: [
      { k: 'showMonth', l: '显示年月', t: 'bool' },
      { k: 'showLunar', l: '显示农历与宜忌', t: 'bool' },
      { k: 'showSchedule', l: '显示日程与待办', t: 'bool' },
    ],
    /* 节日与农历同开同关（同一个 showLunar）；日程存 config.events（见 core/schedule） */
    def: { showMonth: true, showLunar: true, showSchedule: true, events: [] },
  },
  weather: {
    t: 'weather', n: '天气', g: '天', c: '#38BDF8', s: '实况天气 · 自动定位（可手选城市）', units: { w: 4, h: 2 },
    min: { w: 4, h: 2 },
    fields: [
      { k: 'unit', l: '温度单位', t: 'sel', o: ['摄氏 °C', '华氏 °F'] },
      { k: 'showRange', l: '显示温度区间', t: 'bool' },
    ],
    def: { unit: '摄氏 °C', showRange: true },
  },
  todo: {
    t: 'todo', n: '待办清单', g: '待', c: '#38A29E', s: '多清单 · 今日任务', units: { w: 4, h: 2 },
    fields: [{ k: 'title', l: '清单名称', t: 'text', ph: '待办' }, { k: 'showCheck', l: '显示勾选图标', t: 'bool' }],
    def: { title: '待办', showCheck: true },
  },
  countdown: {
    t: 'countdown', n: '倒计时', g: '倒', c: '#FB923C', s: '下班 / 倒数日 / 纪念日可同时显示', units: { w: 8, h: 4 },
    /* 三种计时模式共用一套卡片：主读数（下班时刻 HH:MM:SS / 目标日期天数 / 起始日期已过天数）+ 倒数列表。
       多模式可同时勾选，卡上按设定顺序依次轮播（也可固定显示其中一种），见 core/countdown。
       各模式的时刻 / 日期 / 标题 / 单位在卡片详情弹窗里改（专属字段只留三项，守住配置项上限）。
       4×2 矮卡只留主读数（即原「倒数日」卡的形态），故下限 4×2 */
    min: { w: 4, h: 2 },
    fields: [
      { k: 'modes', l: '显示模式', t: 'multi', o: ['下班倒计时', '倒数日', '纪念日'] },
      { k: 'rotate', l: '多模式轮播', t: 'bool' },
      { k: 'showFestivals', l: '显示节日倒数', t: 'bool' },
    ],
    /* 旧键（mode / mascotEmoji）仍在读取时兼容：mode 会被转成 modes，见 core/countdown 的 normModes */
    def: {
      modes: ['下班倒计时'], rotate: true, at: '18:00', date: '2027-01-01', annDate: '2020-05-20',
      title: '与MiNa相识', unitLabel: '天', showFestivals: true,
    },
  },
  fav: {
    t: 'fav', n: '收藏夹', g: '藏', c: '#F59E0B', s: '管理浏览器书签收藏夹', units: { w: 2, h: 4 },
    fields: [{ k: 'folder', l: '收藏夹', t: 'text', ph: '收藏夹' }, { k: 'showIcon', l: '显示图标', t: 'bool' }],
    def: { folder: '收藏夹', showIcon: true },
  },
  icon: {
    t: 'icon', n: '网站图标', g: '网', c: '#64748B', s: '添加单个网站到桌面', units: { w: 2, h: 2 },
    fields: [{ k: 'url', l: '网站链接', t: 'text', ph: 'https://' }], def: { url: '' },
  },
  folder: {
    t: 'folder', n: '图标文件夹', g: '夹', c: '#94A3B8', s: '把多个图标收进文件夹', units: { w: 2, h: 2 },
    /* 文件夹卡默认去卡片化（透明底 + 居中图标）：名称在卡内显示，而非卡外标签 */
    fields: [{ k: 'showName', l: '显示名称', t: 'bool' }],
    def: { showName: true },
  },
  group: {
    t: 'group', n: '图标格容器', g: '格', c: '#0EA5E9', s: '一格里放多个网站图标', units: { w: 4, h: 4 },
    /* 图标格按卡片尺寸自动铺满：宽 2 格（98px）放不下一行图标，高度上 2 格起即可（出厂布局即有 8×2 的容器） */
    min: { w: 4, h: 2 },
    /* 行列不再手填：按卡片尺寸自动铺满（shared/grid 的 groupGrid） */
    fields: [{ k: 'apps', l: '应用列表', t: 'list', ph: '淘宝, 京东, 知乎' }],
    def: { apps: [] },
  },
};

/** 全部小组件类型键集合（导入 / 持久化校验用） */
export const WIDGET_KINDS: ReadonlySet<string> = new Set(Object.keys(WIDGET_DEFS));

/**
 * 旧类型转接（存量文档与旧备份导入时放行并转换，位置 / 尺寸 / 配置原样保留）：
 * - 「倒数日」→「倒计时」倒数日模式
 * - 「纪念日」→「倒计时」纪念日模式（标题 / 起始日期 / 天数单位三个键与倒计时定义表同名，无缝衔接）
 * 无旧类型返回 null（调用方按未知类型丢弃——被移除的组件：新闻 / 音乐 / AI / 每日一言 / 木鱼 / 计算器 / 翻译）。
 */
export const fromLegacyKind = (t: string, config: Record<string, unknown>): { t: WidgetKind; config: Record<string, unknown> } | null => {
  if (t === 'countday') return { t: 'countdown', config: { ...config, mode: '倒数日' } };
  if (t === 'ann') return { t: 'countdown', config: { ...config, mode: '纪念日' } };
  return null;
};

/* ---------- 组件库（个性化 → 组件库：一张清单全放在一起，不再分组） ---------- */

/**
 * 不进组件库的类型（用户要求从组件库里去掉，入口在空白处右键）：
 * 待办清单 / 收藏夹 / 图标文件夹 / 图标格容器 / 网站图标——前三类与网站图标都不是「小组件」，
 * 添加网站图标是右键一级的第一项。这些类型仍是合法的卡片类型——
 * 已放好的照常渲染、编辑、删除，只是不再出现在组件库与默认大小面板里。
 */
export const LIBRARY_EXCLUDED: ReadonlySet<WidgetKind> = new Set<WidgetKind>(['todo', 'fav', 'folder', 'group', 'icon']);

/** 全部类型清单（定义表生成；渲染 / 更换组件 / 导入校验用，不受组件库过滤影响） */
export const WIDGET_LIST: readonly WidgetDefinition[] = Object.keys(WIDGET_DEFS).map((k) => WIDGET_DEFS[k as WidgetKind]);

/** 组件库清单：全部类型去掉 LIBRARY_EXCLUDED，单张清单平铺（组件库与「组件默认大小」都按它出条目） */
export const LIBRARY_LIST: readonly WidgetDefinition[] = WIDGET_LIST.filter((w) => !LIBRARY_EXCLUDED.has(w.t));

/** 某类型是否在组件库里（不在的只能从右键 / 其它入口放置） */
export const inLibrary = (t: WidgetKind): boolean => !LIBRARY_EXCLUDED.has(t);

/* ---------- 配置读取（定义默认值 ⊕ 实例覆盖值） ---------- */

export const cfgOf = (it: { t: WidgetKind; config?: Record<string, unknown> | undefined }): Record<string, unknown> =>
  ({ ...WIDGET_DEFS[it.t].def, ...it.config });

export const strOf = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
export const numOf = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const boolOf = (v: unknown): boolean => v === true;
export const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/* ---------- 尺寸自适应（容器查询单位 cqmin 的基准） ---------- */

/**
 * 单位尺寸 → 卡片实际像素（与 shared/grid 的 itemBox 同一算法：单位数 × CELL − 两侧内缩）。
 * 内缩按类型取：图标类贴边（ICON_INSET）、其余组件用 INSET；不给类型时按组件口径（调用方通常在算组件）。
 */
export const boxOfUnits = (w: number, h: number, t?: WidgetKind): { w: number; h: number } => {
  const inset = t === undefined ? INSET : insetOf(t);
  return { w: w * CELL - 2 * inset, h: h * CELL - 2 * inset };
};

/**
 * 组件「自然尺寸」（px）：定义表 units 对应的实际卡片框。
 * 内容排版以自然尺寸为 1 设计像素（CSS 里写 calc(N * var(--u))）：
 * 自然尺寸下渲染与设计稿逐像素一致，更大的卡片按 min(宽比, 高比) 等比放大，更小的卡片不缩小。
 */
export const naturalBoxOf = (t: WidgetKind): { w: number; h: number } =>
  boxOfUnits(WIDGET_DEFS[t].units.w, WIDGET_DEFS[t].units.h, t);

/** 组件「自然短边」（px）——@container 密度降级阈值与调试用 */
export const naturalMinOf = (t: WidgetKind): number => {
  const box = naturalBoxOf(t);
  return Math.min(box.w, box.h);
};

/** 组件的尺寸能力下限（缺省 2×2） */
export const minSizeOf = (t: WidgetKind): { w: number; h: number } => WIDGET_DEFS[t].min ?? { w: 2, h: 2 };
/** 组件的尺寸能力上限（缺省 8×4，即六档里的最大） */
export const maxSizeOf = (t: WidgetKind): { w: number; h: number } => WIDGET_DEFS[t].max ?? { w: 8, h: 4 };

/** 某尺寸是否在该组件的能力区间内（两轴都要落区间；六档合法性仍由 shared/grid 的 isLegalSize 判定） */
export const sizeAllowed = (t: WidgetKind, w: number, h: number): boolean => {
  const lo = minSizeOf(t);
  const hi = maxSizeOf(t);
  return w >= lo.w && h >= lo.h && w <= hi.w && h <= hi.h;
};

/**
 * 尺寸能力（含实例配置）：在定义表区间之上再按实例内容收紧。
 * 目前只有图标格容器——应用多到该尺寸装不下（只能滚动浏览）时不允许选，避免把用户的容器压成滚动条。
 */
export const sizeAllowedFor = (
  t: WidgetKind,
  config: Record<string, unknown>,
  w: number,
  h: number,
): boolean => {
  if (!sizeAllowed(t, w, h)) return false;
  if (t === 'group') {
    const apps = Array.isArray(config['apps']) ? config['apps'] : [];
    return groupFits(apps.length, w, h);
  }
  return true;
};

/**
 * 新放置实例采用的尺寸：优先用户为该类型单独设置的默认大小（组件库 →「默认大小」），
 * 未设置 / 坏值 / 当前内容装不下时回退定义表尺寸。
 */
export const placeSizeOf = (
  t: WidgetKind,
  config: Record<string, unknown>,
  sizeDefaults: Record<string, WidgetSize>,
): { w: number; h: number } => {
  const p = sizeDefaults[t];
  return p !== undefined && sizeAllowedFor(t, config, p.w, p.h) ? p : WIDGET_DEFS[t].units;
};
