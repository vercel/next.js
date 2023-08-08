import * as React from 'react'
import { useOnClickOutside } from '../../hooks/use-on-click-outside'

export type DialogProps = {
  children?: React.ReactNode
  type: 'error' | 'warning'
  'aria-labelledby': string
  'aria-describedby': string
  onClose?: (e: MouseEvent | TouchEvent) => void
}

const Dialog: React.FC<DialogProps> = function Dialog({
  children,
  type,
  onClose,
  ...props
}) {
  const [dialog, setDialog] = React.useState<HTMLDivElement | null>(null)
  const [role, setRole] = React.useState<string | undefined>(
    typeof document !== 'undefined' && document.hasFocus()
      ? 'dialog'
      : undefined
  )
  const onDialog = React.useCallback((node: HTMLDivElement | null) => {
    setDialog(node)
  }, [])
  useOnClickOutside(dialog, onClose)

  // Make HTMLElements with `role=link` accessible to be triggered by the
  // keyboard, i.e. [Enter].
  React.useEffect(() => {
    if (dialog == null) {
      return
    }

    const root = dialog.getRootNode()
    // Always true, but we do this for TypeScript:
    if (!(root instanceof ShadowRoot)) {
      return
    }
    const shadowRoot = root
    function handler(e: KeyboardEvent) {
      const el = shadowRoot.activeElement
      if (
        e.key === 'Enter' &&
        el instanceof HTMLElement &&
        el.getAttribute('role') === 'link'
      ) {
        e.preventDefault()
        e.stopPropagation()

        el.click()
      }
    }

    function handleFocus() {
      // safari will force itself as the active application when a background page triggers any sort of autofocus
      // this is a workaround to only set the dialog role if the document has focus
      setRole(document.hasFocus() ? 'dialog' : undefined)
    }

    shadowRoot.addEventListener('keydown', handler as EventListener)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleFocus)
    return () => {
      shadowRoot.removeEventListener('keydown', handler as EventListener)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleFocus)
    }
  }, [dialog])

  return (
    <div
      ref={onDialog}
      data-nextjs-dialog
      tabIndex={-1}
      role={role}
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']}
      aria-modal="true"
    >
      <div data-nextjs-dialog-banner className={`banner-${type}`} />
      {children}
    </div>
  )
}

export { Dialog }
