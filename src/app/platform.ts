/**
 * 平台服务装配（app ← core 的唯一注入点）
 *
 * core/file-config 需要 UI 回调（确认弹窗 / Toast / 恢复后重载）；
 * 这里把 store 与 DOM 兜底注入进去，保持 core 不依赖 React。
 */
import {
  initFileConfig,
  restoreFileConfigOnStartup,
  setFileConfigUI,
  setOnLocalDataRestored,
} from '../core/file-config'
import { loadDoc } from '../core/storage'
import { useApp } from './store'

/** 文档从存储重新载入 store（本地目录快照恢复后调用） */
export const reloadDocIntoStore = (): void => {
  const doc = loadDoc()
  if (doc === null) return
  useApp.setState({
    settings: doc.settings,
    pages: doc.pages,
    engines: doc.engines.length > 0 ? doc.engines : useApp.getState().engines,
    skins: doc.skins,
    history: doc.history,
    user: doc.user,
    backupTime: doc.backupTime,
  })
  useApp.getState().showToast('本地目录数据已恢复')
}

/** 注入 core 层 UI 回调并启动本地目录同步 */
export const initPlatform = (): void => {
  setFileConfigUI({
    showConfirm: (message) => Promise.resolve(window.confirm(message)),
    showToast: (message) => useApp.getState().showToast(message),
    createModal: () => () => {},
  })
  setOnLocalDataRestored(reloadDocIntoStore)
  initFileConfig()
  void restoreFileConfigOnStartup()
}
