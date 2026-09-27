/**
 * 图标集（线性 / 填充 SVG，均随 currentColor 取色）
 * 统一图标容器规范见 docs/v4/02-UI规格.md §12.2：容器白底、图形用品牌色或强调色。
 */
import type { ReactElement } from 'react'

export const CheckIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
)

export const HeartIcon = (): ReactElement => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7.4-4.4-7.4-9.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.4 3.2C19.4 15.6 12 20 12 20z" /></svg>
)

export const Icon = {
  search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>,
  close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  edit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 20h4L20 8l-4-4L4 16z" /></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></svg>,
  gear: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4z" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  sliders: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
  grid: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></svg>,
  modeMin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 8h14M5 16h9" /></svg>,
  modeStd: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="4.5" width="16" height="15" rx="3" /><path d="M4 10h16" /></svg>,
  modePri: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3l7 3v5.4c0 4-2.9 7.6-7 9-4.1-1.4-7-5-7-9V6z" /><path d="M9.4 12l1.8 1.8 3.6-3.6" /></svg>,
  list: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
  prev: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h2v14H7z" /><path d="M19 5.4v13.2L10 12z" /></svg>,
  next: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 5h2v14h-2z" /><path d="M5 5.4v13.2L14 12z" /></svg>,
  play: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.4v13.2L19 12z" /></svg>,
  pause: () => <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.6" height="14" rx="1" /><rect x="13.4" y="5" width="3.6" height="14" rx="1" /></svg>,
  bookmark: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z" /></svg>,
  fish: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8 3.6-8 8-8z" /><path d="M12 8.4c1.9 0 3.4 1.6 3.4 3.6S13.9 15.6 12 15.6" /><path d="M4 12H1.6" /></svg>,
  cloudy: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 18a4 4 0 0 1-.4-8A5.6 5.6 0 0 1 17 9.4a3.9 3.9 0 0 1-.6 8.6z" /></svg>,
  sync: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M20 12a8 8 0 0 1-13.6 5.7M4 12a8 8 0 0 1 13.6-5.7" /><path d="M17.6 3.4v3.2h-3.2M6.4 20.6v-3.2h3.2" /></svg>,
  image: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3.4" y="4.6" width="17.2" height="14.8" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M4.6 17l4.6-4.4 3.4 3.2 2.6-2.4 3.8 3.6" /></svg>,
  user: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="8.4" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>,
  folder: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.6A2 2 0 0 1 5 4.6h3.5l1.8 2H19a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  calc: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="2.6" width="16" height="18.8" rx="2.4" /><path d="M8 7h8M8 11.6h2M12 11.6h2M16 11.6h.01M8 15.6h2M12 15.6h2M16 15.6h.01M8 19h8" /></svg>,
  trans: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.4 6h8M7.4 4.2V6M9.4 6c-.6 3.4-2.6 6.2-5.6 8M5.2 9.2c1 2 2.6 3.6 4.6 4.6" /><path d="M12.6 20l3.6-9.4L19.8 20M13.9 17h4.7" /></svg>,
  check: CheckIcon,
  heart: HeartIcon,
}