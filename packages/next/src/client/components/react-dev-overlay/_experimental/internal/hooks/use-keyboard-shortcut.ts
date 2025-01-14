import { useEffect } from 'react'

export const MODIFIERS = {
  CTRL_CMD: 'CTRL_CMD',
  ALT: 'ALT',
  SHIFT: 'SHIFT',
} as const

type KeyboardShortcutProps = {
  key: string
  cb: () => void
  modifiers: (typeof MODIFIERS)[keyof typeof MODIFIERS][]
}

export function useKeyboardShortcut({
  key,
  cb,
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
            throw new Error(`Invalid modifier: ${modifier}`)
        }
      })

      if (modifiersPressed && e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault()
        cb()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [key, cb, modifiers])
}
