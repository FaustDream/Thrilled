/**
 * 入口：挂载新标签页应用
 * 样式来自 docs/v4/index.html 冻结原型（styles/prototype.css），组件复用同一套类名，
 * 保证 React 版与原型在视觉上是一份实现。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initPlatform } from './platform'
import './styles/prototype.css'

initPlatform()

const host = document.getElementById('root')
if (host) {
  createRoot(host).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
