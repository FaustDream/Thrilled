/**
 * 多标签页同步：另一个新标签页改配置后，本页跟着刷新
 *
 * 判重口径是「内容快照」而不是写入方标记：两边内容一致就直接忽略，
 * 因此本页回读后再落盘的那一次写入不会引发来回反弹。
 */
import { DOC_KEY } from '../shared/constants'
import { adoptExternalDoc } from '../core/storage'
import { useApp } from './store'
import { reloadDocIntoStore } from './platform'

/** 参与比较的切片（与 buildDoc 落盘字段一致，updatedAt / 版本号这类每次都变的不算） */
const snapshot = (d: {
  settings: unknown; pages: unknown; engines: unknown; skins: unknown; history: unknown; backupTime: unknown
}): string => JSON.stringify([d.settings, d.pages, d.engines, d.skins, d.history, d.backupTime])

const currentSnapshot = (): string => {
  const s = useApp.getState()
  return snapshot({
    settings: s.settings, pages: s.pages, engines: s.engines, skins: s.skins, history: s.history, backupTime: s.backupTime,
  })
}

/** 注册跨标签同步（无 chrome.storage 的开发预览环境自动跳过） */
export const startCrossTabSync = (): void => {
  if (typeof chrome === 'undefined' || chrome.storage?.onChanged === undefined) return
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const change = changes[DOC_KEY]
    if (change === undefined || change.newValue === undefined) return
    /* 先让本页缓存跟上别人的写入，再回读：直接 loadDoc 会拿到自己这份旧缓存 */
    const doc = adoptExternalDoc(change.newValue)
    if (doc === null) return
    if (snapshot(doc) === currentSnapshot()) return
    reloadDocIntoStore()
    useApp.getState().showToast('已在其他标签页修改，本页已同步')
  })
}
