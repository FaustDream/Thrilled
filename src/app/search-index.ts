/**
 * 搜索框结果索引（纯函数，可单测）
 *
 * 搜索框下面那个下拉面板原先只放「搜索历史」，现在升级成命令面板：输入即按组出结果
 * （应用 → 卡片 → 书签 → 搜索历史），键盘 ↑↓ 选择、回车执行。检索只做名称 / 域名子串匹配，
 * 不引拼音表（几十 KB 换来的是「首字母能搜」，不划算）。
 *
 * 数据来源全部在内存里（pages / 书签缓存 / 历史），这里不碰 chrome.* 与 DOM。
 */

import { brandOf, siteUrlOf } from './brands'
import { cfgOf, WIDGET_DEFS } from '../shared/widget-defs'
import { hostOf } from '../core/utils'
import type { BookmarkEntry } from '../core/bookmark-importer'
import type { UsageEntry } from './usage'
import type { GridItem, WidgetKind } from '../shared/types'

/** 命中类型：决定回车时怎么执行 */
export type HitKind = 'app' | 'card' | 'bookmark' | 'action' | 'recent' | 'history' | 'search';

/** 一条命中 */
export interface SearchHit {
  /** 唯一键（键盘选中 / data-v 回传都靠它） */
  key: string;
  kind: HitKind;
  label: string;
  /** 右侧说明：域名 / 所在卡片 / 组名 */
  sub: string;
  /** 要打开的地址（app / bookmark） */
  url: string;
  /** 目标卡片 id（card） */
  cardId: string;
  /** 搜索历史词（history） */
  term: string;
  /** 参与匹配但不上屏的别名（动作用：换壁纸 / 背景…），没有给空串 */
  alt: string;
  /** 左侧方形字形的字与底色（沿用品牌色口径） */
  glyph: string;
  color: string;
}

export interface SearchGroup {
  title: string;
  hits: SearchHit[];
}

/** 各组命中上限：面板高度固定，宁可少而准，也不让它变成一长条 */
const APP_LIMIT = 6;
const CARD_LIMIT = 3;
const BOOKMARK_LIMIT = 3;
const ACTION_LIMIT = 5;

/** 有详情视图、值得在面板里单独出现的卡片类型（icon / group 已拆成具体应用；folder 没有详情视图） */
const CARD_KINDS: ReadonlySet<WidgetKind> = new Set<WidgetKind>(['clock', 'cal', 'weather', 'todo', 'note', 'countdown', 'fav']);

const lower = (s: string): string => s.trim().toLowerCase();

/**
 * 单个字段的匹配分：完全相同 > 前缀 > 靠前的包含 > 靠后的包含；不命中为 0。
 * 分值只用于组内排序，不对外暴露。
 */
export const scoreOf = (text: string, q: string): number => {
  const t = lower(text);
  if (t === '' || q === '') return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const at = t.indexOf(q);
  if (at < 0) return 0;
  return Math.max(10, 60 - at);
};

/** 组内检索 + 排序 + 截断（label 权重最高，别名次之，右侧说明只做辅助） */
const matchList = (hits: readonly SearchHit[], q: string, limit: number): SearchHit[] =>
  hits
    .map((h, i) => ({ h, i, s: Math.max(scoreOf(h.label, q), scoreOf(h.alt, q) * 0.7, scoreOf(h.sub, q) * 0.5) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.h);

/** 卡片显示名：用户起的名字优先，其次组件定义里的名字 */
export const cardLabelOf = (item: GridItem): string => {
  const label = cfgOf(item)['label'];
  const name = cfgOf(item)['name'];
  if (typeof label === 'string' && label.trim() !== '') return label.trim();
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  return WIDGET_DEFS[item.t].n;
};

/** 图标格里的应用名列表（脏数据直接过滤掉） */
const appNamesOf = (item: GridItem): string[] => {
  const apps = cfgOf(item)['apps'];
  return Array.isArray(apps) ? apps.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
};

const appHit = (key: string, label: string, url: string, sub: string): SearchHit => {
  const brand = brandOf(label);
  return { key, kind: 'app', label, sub, url, cardId: '', term: '', alt: '', glyph: brand.glyph, color: brand.color };
};

/**
 * 从页面集里抽出「应用」与「卡片」两类命中。
 * 图标卡 = 一个应用（名称 / 域名）；图标格 = 格子里的每个应用；其余有详情视图的组件 = 一张卡片。
 */
export const indexPages = (pages: readonly GridItem[][]): { apps: SearchHit[]; cards: SearchHit[] } => {
  const apps: SearchHit[] = [];
  const cards: SearchHit[] = [];
  pages.forEach((page) => {
    page.forEach((item) => {
      if (item.t === 'icon') {
        const cfg = cfgOf(item);
        const label = cardLabelOf(item);
        const explicit = typeof cfg['url'] === 'string' ? cfg['url'].trim() : '';
        const url = /^https?:\/\//.test(explicit) ? explicit : (siteUrlOf(label) ?? '');
        apps.push(appHit(`app:${item.id}`, label, url, hostOf(url)));
        return;
      }
      if (item.t === 'group') {
        const groupLabel = cardLabelOf(item);
        appNamesOf(item).forEach((name, i) => {
          apps.push(appHit(`app:${item.id}:${i}`, name, siteUrlOf(name) ?? '', groupLabel));
        });
        return;
      }
      if (!CARD_KINDS.has(item.t)) return;
      const def = WIDGET_DEFS[item.t];
      const label = cardLabelOf(item);
      cards.push({
        key: `card:${item.id}`,
        kind: 'card',
        label,
        /* 名字和类型同名（「天气」卡）时右侧不再重复一遍，改标「组件」 */
        sub: label === def.n ? '组件' : def.n,
        url: '',
        cardId: item.id,
        term: '',
        alt: '',
        glyph: def.g,
        color: def.c,
      });
    });
  });
  return { apps, cards };
};

/** 书签 → 命中（标题与域名都参与匹配） */
export const bookmarkHits = (entries: readonly BookmarkEntry[]): SearchHit[] =>
  entries.map((e) => ({
    key: `bm:${e.url}`,
    kind: 'bookmark',
    label: e.label,
    sub: hostOf(e.url),
    url: e.url,
    cardId: '',
    term: '',
    alt: '',
    glyph: '签',
    color: '#F59E0B',
  }));

/**
 * 使用记录 → 「最近打开」命中（空输入时的第一组）。
 * 键前缀 recent:，执行时按 kind 走「开站点」或「开卡片详情」。
 */
export const recentHits = (items: readonly { key: string; entry: UsageEntry }[]): SearchHit[] =>
  items.map(({ key, entry }) => {
    const brand = brandOf(entry.label);
    return {
      key: `recent:${key}`,
      kind: 'recent',
      label: entry.label,
      sub: entry.kind === 'card' ? '卡片' : hostOf(entry.url),
      url: entry.url,
      cardId: entry.cardId,
      term: '',
      alt: '',
      glyph: entry.kind === 'card' ? '卡' : brand.glyph,
      color: entry.kind === 'card' ? '#64748B' : brand.color,
    };
  });

/** 搜索历史 → 命中 */
export const historyHits = (history: readonly string[]): SearchHit[] =>
  history.map((term) => ({
    key: `his:${term}`,
    kind: 'history',
    label: term,
    sub: '',
    url: '',
    cardId: '',
    term,
    alt: '',
    glyph: '史',
    color: '',
  }));

/** 「在引擎里搜索当前输入」的兜底行（永远排在最后，↓ 才走得到） */
const searchHit = (term: string, engineName: string): SearchHit => ({
  key: `search:${term}`,
  kind: 'search',
  label: `搜索「${term}」`,
  sub: engineName,
  url: '',
  cardId: '',
  term,
  alt: '',
  glyph: '搜',
  color: '',
});

/** 检索数据源（全部在内存里） */
export interface SearchSource {
  apps: readonly SearchHit[];
  cards: readonly SearchHit[];
  bookmarks: readonly SearchHit[];
  /** 可执行动作（见 app/search-actions）：排在书签之后、搜索行之前 */
  actions?: readonly SearchHit[];
  /** 最近打开（见 app/usage）：只在空输入时作为第一组出现 */
  recent?: readonly SearchHit[];
  history: readonly string[];
}

/**
 * 一次检索：未输入时只给搜索历史；有输入时按组返回，组内按匹配度排序。
 * 书签里与「应用」重复的地址会被去掉（同一个站不用出现两次）。
 */
export const searchAll = (raw: string, src: SearchSource, engineName = ''): SearchGroup[] => {
  const q = lower(raw);
  const groups: SearchGroup[] = [];
  if (q === '') {
    /* 空输入：先给最近打开（省掉翻页找站），再给搜索历史 */
    const recent = src.recent ?? [];
    if (recent.length > 0) groups.push({ title: '最近打开', hits: [...recent] });
    const hits = historyHits(src.history);
    if (hits.length > 0) groups.push({ title: '搜索历史', hits });
    return groups;
  }
  const apps = matchList(src.apps, q, APP_LIMIT);
  const cards = matchList(src.cards, q, CARD_LIMIT);
  const takenUrls = new Set(apps.map((h) => h.url).filter((u) => u !== ''));
  const bookmarks = matchList(src.bookmarks, q, BOOKMARK_LIMIT + 3).filter((h) => !takenUrls.has(h.url)).slice(0, BOOKMARK_LIMIT);
  const actions = matchList(src.actions ?? [], q, ACTION_LIMIT);
  if (apps.length > 0) groups.push({ title: '应用', hits: apps });
  if (cards.length > 0) groups.push({ title: '卡片', hits: cards });
  if (bookmarks.length > 0) groups.push({ title: '书签', hits: bookmarks });
  if (actions.length > 0) groups.push({ title: '动作', hits: actions });
  if (groups.length === 0) {
    /* 一片空白时给历史，至少不让人对着空面板发愣 */
    const hits = historyHits(src.history);
    if (hits.length > 0) groups.push({ title: '搜索历史', hits });
  }
  groups.push({ title: '搜索', hits: [searchHit(raw.trim(), engineName)] });
  return groups;
};

/** 分组摊平（键盘 ↑↓ 在同一份列表上走） */
export const flattenGroups = (groups: readonly SearchGroup[]): SearchHit[] => groups.flatMap((g) => g.hits);
