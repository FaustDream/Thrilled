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
import { askConfirm } from './dialog'

/** 文档从存储重新载入 store（本地目录快照恢复后调用；启动路径静默，提示由手动操作自带） */
export const reloadDocIntoStore = (): void => {
  const doc = loadDoc()
  if (doc === null) return
  useApp.setState({
    settings: doc.settings,
    pages: doc.pages,
    engines: doc.engines.length > 0 ? doc.engines : useApp.getState().engines,
    skins: doc.skins,
    history: doc.history,
    backupTime: doc.backupTime,
  })
}

/** 注入 core 层 UI 回调并绑定本地目录同步的界面事件（不发起磁盘读取） */
export const initPlatform = (): void => {
  setFileConfigUI({
    /* 本地目录相关的确认也走应用内对话框（与其它危险操作同一套外观） */
    showConfirm: (message) => askConfirm({ title: '确认操作', message, confirmText: '继续' }),
    showToast: (message) => useApp.getState().showToast(message),
    createModal: () => () => {},
  })
  setOnLocalDataRestored(reloadDocIntoStore)
  initFileConfig()
}

/**
 * 启动本地目录快照恢复。
 *
 * 要读磁盘、校验目录权限，耗时可达 1–2 秒，故不放在首屏之前：界面先按本地配置渲染，
 * 这一步在后台跑；快照确实更新时才写回并刷新界面（旧快照会被 restoreAllData 挡掉）。
 */
export const startFileConfigRestore = (): void => {
  void restoreFileConfigOnStartup()
}
