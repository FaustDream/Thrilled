/**
 * 搜索面板里的「动作」（v5.0.34）
 *
 * 面板最后一组：输入动作名就能直接执行，省掉「打开抽屉 → 找分区 → 点开关」那几步。
 * 动作永远排在应用 / 卡片 / 书签之后，回车默认命中的是第一组，所以不会手快改设置。
 *
 * 这里只放「一步就能完成、且不破坏数据」的动作；重置也收进来，但它自带二次确认弹窗。
 */

import { buildLayoutDoc, downloadJson } from '../core/export';
import { useApp } from './store';
import type { SearchHit } from './search-index';

type StoreState = ReturnType<typeof useApp.getState>;

interface ActionDef {
  id: string;
  /** 面板上显示的名字（同时是主要匹配文本） */
  label: string;
  /** 额外别名：用户想到的词与标签不一致时也能搜到 */
  words: readonly string[];
  run: (st: StoreState) => void;
}

const ACTIONS: readonly ActionDef[] = [
  { id: 'mode-minimal', label: '切换到极简模式', words: ['极简', '简洁', '模式'], run: (st) => { st.setMode('minimal') } },
  { id: 'mode-standard', label: '切换到标准模式', words: ['标准', '模式'], run: (st) => { st.setMode('standard') } },
  { id: 'wallpaper', label: '更换壁纸', words: ['壁纸', '背景', '换背景'], run: (st) => { st.setPersonalTab(0); st.setDrawer('personal') } },
  { id: 'personal', label: '打开个性化', words: ['个性化', '外观', '风格'], run: (st) => { st.setDrawer('personal') } },
  { id: 'setting', label: '打开设置', words: ['设置', '配置', '选项'], run: (st) => { st.setDrawer('setting') } },
  { id: 'add', label: '添加卡片或组件', words: ['添加', '新建', '组件', '卡片'], run: (st) => { st.setDrawer('add') } },
  { id: 'arrange', label: '整理本页图标', words: ['整理', '补位', '对齐'], run: (st) => { st.arrange() } },
  {
    id: 'export',
    label: '导出布局 JSON',
    words: ['导出', '备份', 'json'],
    run: (st) => {
      downloadJson('thrilled-layout.json', buildLayoutDoc(st.exportLayout().pages));
      st.showToast('已导出 thrilled-layout.json');
    },
  },
  { id: 'clear-history', label: '清空搜索历史', words: ['清空', '历史'], run: (st) => { st.clearHistory(); st.showToast('已清空搜索历史') } },
  { id: 'reset', label: '一键重置（需确认）', words: ['重置', '恢复出厂', '清空'], run: (st) => { st.setModal('reset') } },
];

/** 动作列表 → 面板命中（键前缀 act:，执行时按 id 反查） */
export const searchActionHits = (): SearchHit[] =>
  ACTIONS.map((a) => ({
    key: `act:${a.id}`,
    kind: 'action',
    label: a.label,
    sub: '',
    url: '',
    cardId: '',
    term: '',
    alt: a.words.join(' '),
    glyph: '做',
    color: '',
  }));

/** 执行动作（面板回车 / 点击） */
export const runSearchAction = (key: string): void => {
  const id = key.startsWith('act:') ? key.slice(4) : '';
  const def = ACTIONS.find((a) => a.id === id);
  if (def !== undefined) def.run(useApp.getState());
};
