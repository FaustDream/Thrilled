/**
 * 图标集（线性 / 填充 SVG，均随 currentColor 取色）
 * 统一图标容器规范见 docs/v4/02-UI规格.md §12.2：容器白底、图形用品牌色或强调色。
 */
import type { ReactElement } from 'react'

export const CheckIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
)

export const Icon = {
  search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>,
  close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  edit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20h4L20 8l-4-4L4 16z" /></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>,
  gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4z" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  /* 说明气泡：标题右侧 ⓘ，悬停/聚焦展开低频说明文案 */
  info: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="8.6" /><path d="M12 11.2v5" /><path d="M12 7.6v.01" /></svg>,
  /* 溢出菜单：行尾「···」，低频操作收纳 */
  more: () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5.2" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.8" cy="12" r="1.7" /></svg>,
  sliders: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  grid: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></svg>,
  /* 模式与 Dock 功能图标（iconfont 单色线性风格） */
  feather: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 3.8a5.7 5.7 0 0 0-8.1 0L5 10.9V19h8.1l7.1-7.1a5.7 5.7 0 0 0 0-8.1z" /><path d="M16 8L2.5 21.5" /><path d="M14.5 15H9.5" /></svg>,
  modeStd: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3.8" y="3.8" width="7" height="7" rx="2.2" /><rect x="13.2" y="3.8" width="7" height="7" rx="2.2" /><rect x="3.8" y="13.2" width="7" height="7" rx="2.2" /><rect x="13.2" y="13.2" width="7" height="7" rx="2.2" /></svg>,
  palette: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01a1.5 1.5 0 0 1 1.11-2.49H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4.2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4.2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" /></svg>,
  bookmark: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z" /></svg>,
  pin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M8 3h8l-1.2 5.2 2.7 2.7a1 1 0 0 1 .5.9V13H6v-1.2a1 1 0 0 1 .5-.9l2.7-2.7z" /></svg>,
  cloudy: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 18a4 4 0 0 1-.4-8A5.6 5.6 0 0 1 17 9.4a3.9 3.9 0 0 1-.6 8.6z" /></svg>,
  sync: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M20 12a8 8 0 0 1-13.6 5.7M4 12a8 8 0 0 1 13.6-5.7" /><path d="M17.6 3.4v3.2h-3.2M6.4 20.6v-3.2h3.2" /></svg>,
  image: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3.4" y="4.6" width="17.2" height="14.8" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M4.6 17l4.6-4.4 3.4 3.2 2.6-2.4 3.8 3.6" /></svg>,
  user: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="8.4" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  folder: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.6A2 2 0 0 1 5 4.6h3.5l1.8 2H19a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  check: CheckIcon,
}