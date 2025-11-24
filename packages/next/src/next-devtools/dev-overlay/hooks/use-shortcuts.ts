import { useEffect } from 'react'
import { getActiveElement } from '../components/errors/dev-tools-indicator/utils'

export function useShortcuts(
  shortcuts: Record<string, () => void>,
  rootRef: React.RefObject<HTMLElement | null>
) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isFocusedOnElement(rootRef)) return

      const keys = []

      if (e.metaKey) keys.push('Meta')
      if (e.ctrlKey) keys.push('Control')
      if (e.altKey) keys.push('Alt')
      if (e.shiftKey) keys.push('Shift')

      if (
        e.key !== 'Meta' &&
        e.key !== 'Control' &&
        e.key !== 'Alt' &&
        e.key !== 'Shift'
      ) {
        keys.push(e.code)
      }

      const shortcut = keys.join('+')

      if (shortcuts[shortcut]) {
        e.preventDefault()
        shortcuts[shortcut]()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rootRef, shortcuts])
}

function isFocusedOnElement(rootRef: React.RefObject<HTMLElement | null>) {
  const el = getActiveElement(rootRef.current)

  if (!el) return false

  if (
    el.contentEditable === 'true' ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.dataset['shortcut-recorder'] === 'true'
  ) {
    // It's okay to trigger global keybinds from readonly inputs
    if (el.hasAttribute('readonly')) {
      return false
    }
    return true
  }

  return false
}
