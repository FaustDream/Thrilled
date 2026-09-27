/**
 * 小组件定义表（内容模型的唯一来源，冻结于 docs/v4/02-UI规格.md §13.1）
 *
 * 定义决定：显示名 / 字形 / 品牌色 / 默认单位尺寸 / 可编辑字段 / 默认配置
 * 实例决定：位置与尺寸（布局）+ config（内容）
 * 纯数据无 React 依赖 → app（渲染 / 编辑弹窗）与 core（导入校验 / 迁移）共用。
 */
import type { WidgetDefinition, WidgetKind } from './types';

export const WIDGET_DEFS: Record<WidgetKind, WidgetDefinition> = {
  news: {
    t: 'news', n: '新闻热点', g: '闻', c: '#FF4D4F', s: '看点 / 百度 / 微博 / 抖音热榜', units: { w: 8, h: 4 },
    fields: [
      { k: 'source', l: '热榜来源', t: 'sel', o: ['看点', '百度', '微博', '抖音'] },
      { k: 'count', l: '显示条数', t: 'num', ph: '1–6' },
    ],
    def: { source: '看点', count: 5 },
  },
  clock: {
    t: 'clock', n: '时钟', g: '钟', c: '#3B82F6', s: '数字时钟 · 时分秒可调', units: { w: 4, h: 4 },
    fields: [{ k: 'showSeconds', l: '显示秒数', t: 'bool' }], def: { showSeconds: false },
  },
  cal: { t: 'cal', n: '日历', g: '历', c: '#0EA5E9', s: '公历 / 农历 / 宜忌', units: { w: 4, h: 2 }, fields: [], def: {} },
  weather: {
    t: 'weather', n: '天气', g: '天', c: '#38BDF8', s: '实况天气 · 城市可调', units: { w: 4, h: 2 },
    fields: [{ k: 'city', l: '城市', t: 'text', ph: '北京' }], def: { city: '北京' },
  },
  todo: {
    t: 'todo', n: '待办清单', g: '待', c: '#38A29E', s: '多清单 · 今日任务', units: { w: 4, h: 2 },
    fields: [{ k: 'title', l: '清单名称', t: 'text', ph: '待办' }], def: { title: '待办' },
  },
  ann: {
    t: 'ann', n: '纪念日', g: '纪', c: '#F472B6', s: '在一起 · 生日 · 倒数', units: { w: 8, h: 4 },
    fields: [{ k: 'title', l: '标题', t: 'text', ph: '与 MiNa 相识' }, { k: 'date', l: '起始日期', t: 'text', ph: '2020-05-20' }],
    def: { title: '与MiNa相识', date: '2020-05-20' },
  },
  countday: {
    t: 'countday', n: '倒数日', g: '倒', c: '#A855F7', s: '距离某天还有多久', units: { w: 4, h: 2 },
    fields: [{ k: 'title', l: '标题', t: 'text', ph: '距离国庆假期' }, { k: 'days', l: '剩余天数', t: 'num', ph: '5' }],
    def: { title: '距离国庆假期', days: 5 },
  },
  countdown: {
    t: 'countdown', n: '下班倒计时', g: '班', c: '#FB923C', s: '进度 / 工资 / 任务', units: { w: 8, h: 4 },
    fields: [{ k: 'at', l: '下班时刻', t: 'text', ph: '18:00' }], def: { at: '18:00' },
  },
  fav: {
    t: 'fav', n: '收藏夹', g: '藏', c: '#F59E0B', s: '管理浏览器书签收藏夹', units: { w: 2, h: 4 },
    fields: [{ k: 'folder', l: '收藏夹', t: 'text', ph: '收藏夹' }], def: { folder: '收藏夹' },
  },
  quote: { t: 'quote', n: '每日一言', g: '言', c: '#6366F1', s: '时段问候 + 昵称 + 鼓励语', units: { w: 8, h: 2 }, fields: [], def: {} },
  music: {
    t: 'music', n: '音乐', g: '乐', c: '#EC4899', s: '熊猫Dj · 在线电台', units: { w: 4, h: 4 },
    fields: [{ k: 'station', l: '电台', t: 'text', ph: '熊猫Dj' }], def: { station: '熊猫Dj' },
  },
  trans: {
    t: 'trans', n: '翻译', g: '译', c: '#3B82F6', s: '多语种即时翻译', units: { w: 4, h: 2 },
    fields: [{ k: 'pair', l: '语言对', t: 'text', ph: '中 ⇄ 英' }], def: { pair: '中英互译 · 划词' },
  },
  calc: { t: 'calc', n: '计算器', g: '算', c: '#8B5CF6', s: '科学计算 / 单位换算', units: { w: 4, h: 2 }, fields: [], def: {} },
  woodfish: {
    t: 'woodfish', n: '木鱼', g: '鱼', c: '#C98A4B', s: '功德 +1 · 可关后台敲击', units: { w: 2, h: 2 },
    fields: [{ k: 'count', l: '起始功德', t: 'num', ph: '128' }], def: { count: 128 },
  },
  ai: {
    t: 'ai', n: 'AI 对话', g: 'AI', c: '#111827', s: '智能问答入口', units: { w: 4, h: 4 },
    fields: [{ k: 'provider', l: '提供方', t: 'text', ph: 'UiTab AI' }], def: { provider: 'UiTab AI' },
  },
  icon: {
    t: 'icon', n: '网站图标', g: '网', c: '#64748B', s: '添加单个网站到桌面', units: { w: 2, h: 2 },
    fields: [{ k: 'url', l: '网站链接', t: 'text', ph: 'https://' }], def: { url: '' },
  },
  folder: { t: 'folder', n: '图标文件夹', g: '夹', c: '#94A3B8', s: '把多个图标收进文件夹', units: { w: 2, h: 2 }, fields: [], def: {} },
  group: {
    t: 'group', n: '图标格容器', g: '格', c: '#0EA5E9', s: '一格里放多个网站图标', units: { w: 4, h: 4 },
    fields: [{ k: 'cols', l: '列数', t: 'num', ph: '2–8' }, { k: 'apps', l: '应用列表', t: 'list', ph: '淘宝, 京东, 知乎' }],
    def: { cols: 5, apps: [] },
  },
};

/** 全部小组件类型键集合（导入 / 持久化校验用） */
export const WIDGET_KINDS: ReadonlySet<string> = new Set(Object.keys(WIDGET_DEFS));

/** 添加面板清单（定义表生成 + 同类型别名入口「经典语录」） */
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
