import { useEffect } from 'react'
import i18n from '../i18n/i18n'

/**
 * 在页面即将关闭/刷新时弹出浏览器确认对话框
 * @param enabled 是否启用（有未保存内容时为 true）
 * @param message 提示文字（部分浏览器会忽略自定义文字，显示默认提示）
 */
export function useBeforeUnload(enabled: boolean, message = i18n.t('common:beforeUnload.confirm' as any)) {
  useEffect(() => {
    if (!enabled) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Chrome 需要设置 returnValue
      e.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled, message])
}
