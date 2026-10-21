/**
 * 通用对话框（应用内，替代 window.confirm / window.prompt）
 *
 * 设计约束（沿用站内既有 token，不新增字号 / 颜色 / 圆角）：
 * - 层级：标题（h2）> 说明（.sub 次要色）> 操作（右下角两颗按钮，主操作只有一颗）
 * - 输入类：标签在上、输入框在下（.f-row / .f-label / .f-input），错误文案紧贴输入框并使用 --bad
 * - 危险操作：确认键走 .btn.danger，默认焦点落在取消，避免误按回车
 * - 容器复用 .modal-mask / .modal.narrow，与「新建站点」等弹窗同一套外观
 */
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'
import { useApp } from './store'
import type { DialogRequest } from './store'

type Settle = (value: string | boolean | null) => void

/** 同一时刻只有一个对话框：后来的请求先把上一个按「取消」收掉，避免 promise 悬挂 */
let pending: Settle | null = null

const open = (spec: DialogRequest): Promise<string | boolean | null> =>
  new Promise((resolve) => {
    pending?.(false)
    pending = resolve
    useApp.getState().setDialog(spec)
  })

const settle = (value: string | boolean | null): void => {
  const done = pending
  pending = null
  useApp.getState().setDialog(null)
  done?.(value)
}

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export interface InputOptions {
  title: string
  label: string
  value?: string
  placeholder?: string
  confirmText?: string
  validate?: (v: string) => string | null
}

/** 确认框：确定返回 true，取消 / Esc / 点遮罩返回 false */
export const askConfirm = async (o: ConfirmOptions): Promise<boolean> =>
  (await open({ kind: 'confirm', ...o })) === true

/** 输入框：确定返回输入值（已 trim），取消返回 null */
export const askInput = async (o: InputOptions): Promise<string | null> => {
  const v = await open({ kind: 'input', ...o })
  return typeof v === 'string' ? v : null
}

/** 对话框界面（挂在 App 根部，与 Modal 同级） */
export const DialogHost = (): ReactNode => {
  const dialog = useApp((s) => s.dialog)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  /* 每次打开都重置草稿与错误；危险操作把焦点交给取消，输入类焦点交给输入框 */
  useEffect(() => {
    if (dialog === null) return
    setValue(dialog.value ?? '')
    setError('')
    const t = setTimeout(() => {
      if (dialog.kind === 'input') inputRef.current?.focus()
      else if (dialog.danger === true) cancelRef.current?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [dialog])

  if (dialog === null) return null

  const isInput = dialog.kind === 'input'
  const confirm = (): void => {
    if (!isInput) { settle(true); return }
    const v = value.trim()
    const bad = dialog.validate?.(v) ?? null
    if (bad !== null) { setError(bad); inputRef.current?.focus(); return }
    settle(v)
  }
  const onInput = (e: ChangeEvent<HTMLInputElement>): void => {
    setValue(e.target.value)
    if (error !== '') setError('')
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') { e.stopPropagation(); settle(isInput ? null : false) }
    else if (e.key === 'Enter' && isInput) { e.preventDefault(); confirm() }
  }

  return (
    <div className="modal-mask show dlg-mask" onClick={(e) => { if (e.target === e.currentTarget) settle(isInput ? null : false) }}
      onKeyDown={onKey}>
      <div className="modal narrow" role="dialog" aria-modal="true" aria-label={dialog.title}>
        <h2>{dialog.title}</h2>
        {dialog.message !== undefined && <p className="sub">{dialog.message}</p>}
        {isInput && (
          <div className="f-row">
            <label className="f-label">{dialog.label}</label>
            <input ref={inputRef} className={`f-input${error !== '' ? ' bad' : ''}`}
              placeholder={dialog.placeholder ?? ''} value={value} onChange={onInput} />
            {error !== '' && <div className="dlg-err">{error}</div>}
          </div>
        )}
        <div className="btn-row end">
          <button ref={cancelRef} className="btn ghost" onClick={() => settle(isInput ? null : false)}>
            {dialog.cancelText ?? '取消'}
          </button>
          <button className={`btn${dialog.danger === true ? ' danger' : ''}`} onClick={confirm}>
            {dialog.confirmText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
