/**
 * 入口：挂载新标签页应用
 * 样式来自 docs/v4/index.html 冻结原型（styles/prototype.css），组件复用同一套类名，
 * 保证 React 版与原型在视觉上是一份实现。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { initPlatform, startFileConfigRestore } from './platform'
import { startCrossTabSync } from './cross-tab'
import { hydrate } from './store'
import { applyBootBg } from './boot-theme'
import './styles/prototype.css'

/* 首帧先铺上次主题的底色：配置读出来之前页面已经开始绘制，
   不铺这一层会先闪一下默认浅色，再跳成用户的主题 */
applyBootBg()

initPlatform()

const host = document.getElementById('root')

/**
 * 先等配置就绪再挂载：否则首屏会用出厂默认值渲染一遍（默认主题、默认布局），
 * 等存储读回来再整体替换，观感就是「先默认、1–2 秒后跳变」。
 * 读 chrome.storage 通常只有几十毫秒，期间看到的是主题底色而不是默认界面。
 */
const boot = async (): Promise<void> => {
  try {
    await hydrate()
  } catch {
    /* 读取失败也要渲染：store 里是出厂默认值，页面至少可用 */
  }
  if (host === null) return
  createRoot(host).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
  /* 多标签页同步：别的标签页改了配置，本页跟着刷新（内容相同则忽略） */
  startCrossTabSync()
  /* 界面已按本地配置渲染：目录快照的磁盘读取放到挂载之后，不占首屏时间 */
  startFileConfigRestore()
}

void boot()
