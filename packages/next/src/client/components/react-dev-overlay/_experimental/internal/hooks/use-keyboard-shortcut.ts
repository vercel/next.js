import { useEffect } from 'react'

export const MODIFIERS = {
  CTRL_CMD: 'CTRL_CMD',
  ALT: 'ALT',
  SHIFT: 'SHIFT',
} as const

type KeyboardShortcutProps = {
  key: string
  callback: () => void
  modifiers: (typeof MODIFIERS)[keyof typeof MODIFIERS][]
}

export function useKeyboardShortcut({
  key,
  callback,
  modifiers,
}: KeyboardShortcutProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifiersPressed = modifiers.every((modifier) => {
        switch (modifier) {
          case MODIFIERS.CTRL_CMD:
            return e.metaKey || e.ctrlKey
          case MODIFIERS.ALT:
            return e.altKey
          case MODIFIERS.SHIFT:
            return e.shiftKey
          default:
            return false
        }
      })

      if (modifiersPressed && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault()
        callback()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [key, callback, modifiers])
}
