/**
 * 日历旧条目 → 笔记（v5.0.33 一次性迁移，纯逻辑可单测）
 *
 * 日历卡里的「日程」和「待办」本来就是同一份数据（config.events 的 done 字段区分），
 * 这次把「待办」这套语义交出去：条目全量复制成笔记，日历里已办的条目随后删掉，
 * 日历只留未来日程。标记写在文档里（notesSeeded），所以导出 / 目录同步到别的设备时，
 * 那份数据也只会搬一次。
 *
 * 不搬的情况：文档里一条日历条目都没有（只写标记，不凭空建一张空笔记卡）；
 * 页面已经放满 5 页（不写标记、不改数据，等腾出空位下次启动再搬，绝不丢数据）。
 */

import { MAX_PAGES, findSlot } from '../shared/grid';
import { normScheduleEvents } from './schedule';
import { normNoteItems } from './utils';
import type { GridItem, StoredDoc } from '../shared/types';

/** 新笔记卡的尺寸（与定义表一致：4×2） */
const NOTE_W = 4;
const NOTE_H = 2;

export interface NoteSeedResult {
  doc: StoredDoc;
  /** 实际搬过去的条数（0 = 没有可搬的，或没地方放） */
  notes: number;
  /** 文档是否被改过（写标记也算） */
  changed: boolean;
}

/**
 * 把日历里的条目搬进笔记卡。
 * @param doc 载入的文档（不会被就地修改）
 */
export const seedNotesFromCalendar = (doc: StoredDoc): NoteSeedResult => {
  if (doc.notesSeeded === true) return { doc, notes: 0, changed: false };

  /* 1. 收：按页序、卡内录入顺序取出全部条目；日历侧只留下未办的 */
  const texts: string[] = [];
  const pages = doc.pages.map((page) =>
    page.map((item) => {
      if (item.t !== 'cal') return item;
      const events = normScheduleEvents(item.config['events']);
      if (events.length === 0) return item;
      events.forEach((e) => texts.push(e.text));
      const keep = events.filter((e) => !e.done);
      if (keep.length === events.length) return item;
      return { ...item, config: { ...item.config, events: keep } };
    }),
  );

  if (texts.length === 0) return { doc: { ...doc, notesSeeded: true }, notes: 0, changed: true };

  const fresh = texts.map((txt) => ({ txt, pinned: false }));

  /* 2. 有笔记卡就追加到第一张（目录同步过来的数据可能已经有一张） */
  let appended = false;
  const merged = pages.map((page) =>
    page.map((item) => {
      if (appended || item.t !== 'note') return item;
      appended = true;
      const existed = normNoteItems(item.config['items']);
      return { ...item, config: { ...item.config, items: normNoteItems([...existed, ...fresh]) } };
    }),
  );
  if (appended) return { doc: { ...doc, pages: merged, notesSeeded: true }, notes: texts.length, changed: true };

  /* 3. 没有笔记卡就新建一张：第一页起找空位，全满则追加新页 */
  const card: GridItem = {
    id: `n${Date.now().toString(36)}`,
    c: 0, r: 0, w: NOTE_W, h: NOTE_H, t: 'note',
    config: { label: '笔记', title: '笔记', items: fresh },
  };
  const withCard = merged.map((page) => [...page]);
  for (const page of withCard) {
    const slot = findSlot(page, NOTE_W, NOTE_H);
    if (slot !== null) {
      page.push({ ...card, c: slot.c, r: slot.r });
      return { doc: { ...doc, pages: withCard, notesSeeded: true }, notes: texts.length, changed: true };
    }
  }
  if (withCard.length < MAX_PAGES) {
    return { doc: { ...doc, pages: [...withCard, [{ ...card }]], notesSeeded: true }, notes: texts.length, changed: true };
  }
  /* 放不下：什么都不改，等下次启动再试（已办条目这时还不能删） */
  return { doc, notes: 0, changed: false };
};
