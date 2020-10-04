import * as React from 'react'
import { useOnClickOutside } from '../../hooks/use-on-click-outside'

export type DialogProps = {
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
  const onDialog = React.useCallback((node) => {
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

    shadowRoot.addEventListener('keydown', handler as EventListener)
    return () =>
      shadowRoot.removeEventListener('keydown', handler as EventListener)
  }, [dialog])

  return (
    <div
      ref={onDialog}
      data-nextjs-dialog
      tabIndex={-1}
      role="dialog"
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
