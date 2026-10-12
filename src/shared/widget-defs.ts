/**
 * 小组件定义表（内容模型的唯一来源，冻结于 docs/v4/02-UI规格.md §13.1）
 *
 * 定义决定：显示名 / 字形 / 品牌色 / 默认单位尺寸 / 可编辑字段 / 默认配置
 * 实例决定：位置与尺寸（布局）+ config（内容）
 * 纯数据无 React 依赖 → app（渲染 / 编辑弹窗）与 core（导入校验 / 迁移）共用。
 */
import type { WidgetDefinition, WidgetKind } from './types';
import { CELL, INSET, groupFits } from './grid';

export const WIDGET_DEFS: Record<WidgetKind, WidgetDefinition> = {
  news: {
    t: 'news', n: '新闻热点', g: '闻', c: '#FF4D4F', s: '看点 / 百度 / 微博 / 抖音热榜', units: { w: 8, h: 4 },
    /* 横向来源页签 + 五条列表：任一轴小于 4 格都会把正文压到读不清，下限 4×4 */
    min: { w: 4, h: 4 },
    fields: [
      { k: 'source', l: '热榜来源', t: 'sel', o: ['看点', '百度', '微博', '抖音'] },
      { k: 'count', l: '显示条数', t: 'range', min: 1, max: 6, step: 1, unit: ' 条' },
      { k: 'showHeat', l: '显示热度值', t: 'bool' },
    ],
    def: { source: '看点', count: 5, showHeat: true },
  },
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
    t: 'cal', n: '日历', g: '历', c: '#0EA5E9', s: '公历 / 农历 / 宜忌', units: { w: 4, h: 2 }, min: { w: 4, h: 2 },
    fields: [
      { k: 'showMonth', l: '显示年月', t: 'bool' },
      { k: 'showLunar', l: '显示农历与宜忌', t: 'bool' },
    ],
    def: { showMonth: true, showLunar: true },
  },
  weather: {
    t: 'weather', n: '天气', g: '天', c: '#38BDF8', s: '实况天气 · 城市可调', units: { w: 4, h: 2 },
    min: { w: 4, h: 2 },
    fields: [
      { k: 'city', l: '城市', t: 'text', ph: '北京' },
      { k: 'unit', l: '温度单位', t: 'sel', o: ['摄氏 °C', '华氏 °F'] },
      { k: 'showRange', l: '显示温度区间', t: 'bool' },
    ],
    def: { city: '北京', unit: '摄氏 °C', showRange: true },
  },
  todo: {
    t: 'todo', n: '待办清单', g: '待', c: '#38A29E', s: '多清单 · 今日任务', units: { w: 4, h: 2 },
    fields: [{ k: 'title', l: '清单名称', t: 'text', ph: '待办' }, { k: 'showCheck', l: '显示勾选图标', t: 'bool' }],
    def: { title: '待办', showCheck: true },
  },
  ann: {
    t: 'ann', n: '纪念日', g: '纪', c: '#F472B6', s: '在一起 · 生日 · 倒数', units: { w: 8, h: 4 },
    /* 左右分栏（标题 + 大号天数）：短边小于 4 格时字号会掉到个位数 */
    min: { w: 4, h: 4 },
    fields: [
      { k: 'title', l: '标题', t: 'text', ph: '与 MiNa 相识' },
      { k: 'date', l: '起始日期', t: 'text', ph: '2020-05-20' },
      { k: 'unitLabel', l: '天数单位', t: 'text', ph: '天' },
    ],
    def: { title: '与MiNa相识', date: '2020-05-20', unitLabel: '天' },
  },
  countdown: {
    t: 'countdown', n: '倒计时', g: '倒', c: '#FB923C', s: '下班倒计时 + 倒数日', units: { w: 8, h: 4 },
    /* 两种计时模式共用一套卡片：主读数（下班时刻 HH:MM:SS / 目标日期天数）+ 倒数列表 + 吉祥物。
       倒数列表与吉祥物需要 4 格高才装得下；4×2 矮卡只留主读数（即原「倒数日」的形态），故下限 4×2 */
    min: { w: 4, h: 2 },
    fields: [
      { k: 'mode', l: '计时模式', t: 'sel', o: ['下班倒计时', '倒数日'] },
      { k: 'at', l: '下班时刻', t: 'text', ph: '18:00' },
      { k: 'date', l: '目标日期', t: 'text', ph: '2027-01-01' },
    ],
    /* showFestivals / mascotEmoji 不占字段配额（录入在详情弹窗），但默认值仍归定义表：
       渲染侧按「定义默认值 ⊕ 实例覆盖值」合成，旧配置（含 showMascot 兼容）也走这里 */
    def: { mode: '下班倒计时', at: '18:00', date: '2027-01-01', showFestivals: true, mascotEmoji: '' },
  },
  fav: {
    t: 'fav', n: '收藏夹', g: '藏', c: '#F59E0B', s: '管理浏览器书签收藏夹', units: { w: 2, h: 4 },
    fields: [{ k: 'folder', l: '收藏夹', t: 'text', ph: '收藏夹' }, { k: 'showIcon', l: '显示图标', t: 'bool' }],
    def: { folder: '收藏夹', showIcon: true },
  },
  quote: {
    t: 'quote', n: '每日一言', g: '言', c: '#6366F1', s: '时段问候 + 昵称 + 鼓励语', units: { w: 8, h: 2 },
    fields: [
      { k: 'showGreeting', l: '显示问候行', t: 'bool' },
      { k: 'nick', l: '昵称', t: 'text', ph: '留空跟随设置' },
    ],
    def: { showGreeting: true, nick: '' },
  },
  music: {
    t: 'music', n: '音乐', g: '乐', c: '#EC4899', s: '熊猫Dj · 在线电台', units: { w: 4, h: 4 },
    /* 唱片盘 + 三颗播放键需要足够的方块：矮于 4 格时按短边缩到按钮不可点，故下限 4×4 */
    min: { w: 4, h: 4 },
    fields: [{ k: 'station', l: '电台', t: 'text', ph: '熊猫Dj' }, { k: 'showDisc', l: '显示唱片盘', t: 'bool' }],
    def: { station: '熊猫Dj', showDisc: true },
  },
  trans: {
    t: 'trans', n: '翻译', g: '译', c: '#3B82F6', s: '多语种即时翻译', units: { w: 4, h: 2 },
    min: { w: 4, h: 2 },
    fields: [{ k: 'pair', l: '语言对', t: 'text', ph: '中 ⇄ 英' }, { k: 'showIcon', l: '显示图标', t: 'bool' }],
    def: { pair: '中英互译 · 划词', showIcon: true },
  },
  calc: {
    t: 'calc', n: '计算器', g: '算', c: '#8B5CF6', s: '科学计算 / 单位换算', units: { w: 4, h: 2 }, min: { w: 4, h: 2 },
    fields: [{ k: 'desc', l: '副标题', t: 'text', ph: '点击开始计算' }],
    def: { desc: '点击开始计算' },
  },
  woodfish: {
    t: 'woodfish', n: '木鱼', g: '鱼', c: '#C98A4B', s: '功德 +1 · 可关后台敲击', units: { w: 2, h: 2 },
    fields: [
      { k: 'count', l: '起始功德', t: 'num', ph: '128' },
      { k: 'step', l: '每次功课', t: 'num', ph: '1' },
    ],
    def: { count: 128, step: 1 },
  },
  ai: {
    t: 'ai', n: 'AI 对话', g: 'AI', c: '#111827', s: '智能问答入口', units: { w: 4, h: 4 },
    fields: [
      { k: 'provider', l: '提供方', t: 'text', ph: 'UiTab AI' },
      { k: 'sub', l: '副标题', t: 'text', ph: '试试问问这些问题' },
    ],
    def: { provider: 'UiTab AI', sub: '试试问问这些问题' },
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
 * 旧类型转接：「倒数日」已并入「倒计时」（倒数日模式）——
 * 存量文档与旧备份导入时放行并转换，位置 / 尺寸 / 目标日期 / 强调色原样保留；
 * 无旧类型返回 null（调用方按未知类型丢弃）。
 */
export const fromLegacyKind = (t: string, config: Record<string, unknown>): { t: WidgetKind; config: Record<string, unknown> } | null =>
  t === 'countday' ? { t: 'countdown', config: { ...config, mode: '倒数日' } } : null;

/* ---------- 组件库分组（个性化 → 组件库：信息 / 工具 / 内容 / 导航） ---------- */

/** 组件库分组名 */
export type WidgetGroup = '信息' | '工具' | '内容' | '导航';

/** 分组展示顺序 */
export const WIDGET_GROUPS_ORDER: readonly WidgetGroup[] = ['信息', '工具', '内容', '导航'];

/** 每类小组件归属的分组（组件库按此分组浏览；每类只属一组） */
export const WIDGET_GROUPS: Readonly<Record<WidgetKind, WidgetGroup>> = {
  clock: '信息', cal: '信息', weather: '信息', countdown: '信息', ann: '信息',
  todo: '工具', calc: '工具', trans: '工具', ai: '工具', fav: '工具',
  news: '内容', quote: '内容', music: '内容', woodfish: '内容',
  icon: '导航', folder: '导航', group: '导航',
};

/** 组件库清单（定义表生成 + 同类型别名入口「经典语录」） */
export const WIDGET_LIST: readonly WidgetDefinition[] = [
  ...Object.keys(WIDGET_DEFS).map((k) => WIDGET_DEFS[k as WidgetKind]),
  { ...WIDGET_DEFS.quote, n: '经典语录', g: '语', c: '#8B5CF6', s: '随机经典语录' },
];

/* ---------- 配置读取（定义默认值 ⊕ 实例覆盖值） ---------- */
export const cfgOf = (it: { t: WidgetKind; config?: Record<string, unknown> | undefined }): Record<string, unknown> =>
  ({ ...WIDGET_DEFS[it.t].def, ...it.config });

export const strOf = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
export const numOf = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const boolOf = (v: unknown): boolean => v === true;
export const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/* ---------- 尺寸自适应（容器查询单位 cqmin 的基准） ---------- */

/** 单位尺寸 → 卡片实际像素（与 shared/grid 的 itemBox 同一算法：单位数 × CELL − 两侧内缩） */
export const boxOfUnits = (w: number, h: number): { w: number; h: number } => ({
  w: w * CELL - 2 * INSET,
  h: h * CELL - 2 * INSET,
});

/**
 * 组件「自然尺寸」（px）：定义表 units 对应的实际卡片框。
 * 内容排版以自然尺寸为 1 设计像素（CSS 里写 calc(N * var(--u))）：
 * 自然尺寸下渲染与设计稿逐像素一致，更大的卡片按 min(宽比, 高比) 等比放大，更小的卡片不缩小。
 */
export const naturalBoxOf = (t: WidgetKind): { w: number; h: number } =>
  boxOfUnits(WIDGET_DEFS[t].units.w, WIDGET_DEFS[t].units.h);

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
