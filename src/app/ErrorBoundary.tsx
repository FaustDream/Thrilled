/**
 * 顶层错误边界
 *
 * 渲染期异常（含 React #185「Maximum update depth exceeded」这类无限更新）不再整页白屏：
 * - componentDidCatch 会拿到 **组件栈**（React 在此路径必然提供），直接打到控制台——
 *   这是压缩产物下定位 #185 肇事组件的唯一可靠线索
 * - 提供两个恢复入口：重试渲染（清掉错误状态）/ 重新加载
 * 样式内联（不依赖 prototype.css，保证边界自身永远可渲染）。
 */
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  err: Error | null
  stack: string
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { err: null, stack: '' }

  static getDerivedStateFromError(err: Error): State {
    return { err, stack: '' }
  }

  override componentDidCatch(err: Error, info: { componentStack?: string | null }): void {
    const cs = info.componentStack ?? '(无组件栈)'
    this.setState({ stack: cs })
    console.error('[boundary] 渲染异常：', err.message, '\n----- 组件栈（据此定位肇事组件）-----\n', cs)
  }

  private readonly retry = (): void => {
    this.setState({ err: null, stack: '' })
  }

  override render(): ReactNode {
    if (this.state.err === null) return this.props.children
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 14, background: '#10151b', color: '#cbd5e1',
        fontSize: 14, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>界面渲染出错了</div>
        <div style={{ maxWidth: 680, textAlign: 'center', color: '#94a3b8', wordBreak: 'break-all',
          lineHeight: 1.7 }}>{this.state.err.message}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button onClick={this.retry} style={{ padding: '7px 16px', borderRadius: 8, border: 'none',
            background: '#0EA5E9', color: '#fff', cursor: 'pointer', fontSize: 13 }}>重试渲染</button>
          <button onClick={() => location.reload()} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #334155',
            background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: 13 }}>重新加载</button>
        </div>
        <pre style={{ maxWidth: 680, maxHeight: 200, overflow: 'auto', marginTop: 10, padding: 12,
          borderRadius: 8, background: 'rgba(148,163,184,.08)', fontSize: 11, color: '#7d8aa0',
          whiteSpace: 'pre-wrap', userSelect: 'all' }}>{this.state.stack}</pre>
      </div>
    )
  }
}
