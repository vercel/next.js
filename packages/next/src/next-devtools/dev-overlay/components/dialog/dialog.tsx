import * as React from 'react'
import { useOnClickOutside } from '../../hooks/use-on-click-outside'

type DialogProps = {
  children?: React.ReactNode
  'aria-labelledby': string
  'aria-describedby': string
  className?: string
  onClose?: () => void
} & React.HTMLAttributes<HTMLDivElement>

const CSS_SELECTORS_TO_EXCLUDE_ON_CLICK_OUTSIDE = [
  '[data-next-mark]',
  '[data-issues-open]',
  '#nextjs-dev-tools-menu',
  '[data-nextjs-error-overlay-nav]',
  '[data-info-popover]',
  '[data-nextjs-devtools-panel-overlay]',
  '[data-nextjs-devtools-panel-footer]',
  '[data-nextjs-error-overlay-footer]',
]

const Dialog: React.FC<DialogProps> = function Dialog({
  children,
  className,
  onClose,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ...props
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null)
  // TODO: Document is an external store. Either use useSyncExternalStore or always set the role.
  const [role, setRole] = React.useState<string | undefined>(
    typeof document !== 'undefined' && document.hasFocus()
      ? 'dialog'
      : undefined
  )

  useOnClickOutside(
    dialogRef,
    CSS_SELECTORS_TO_EXCLUDE_ON_CLICK_OUTSIDE,
    (e) => {
      e.preventDefault()
      return onClose?.()
    }
  )

  React.useEffect(() => {
    if (dialogRef.current == null) {
      return
    }

    function handleFocus() {
      // safari will force itself as the active application when a background page triggers any sort of autofocus
      // this is a workaround to only set the dialog role if the document has focus
      setRole(document.hasFocus() ? 'dialog' : undefined)
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleFocus)
    }
  }, [])

  React.useEffect(() => {
    const dialog = dialogRef.current
    const root = dialog?.getRootNode()
    const initialActiveElement =
      root instanceof ShadowRoot ? (root?.activeElement as HTMLElement) : null

    // Trap focus within the dialog
    dialog?.focus()

    return () => {
      // Blur first to avoid getting stuck, in case `activeElement` is missing
      dialog?.blur()
      // Restore focus to the previously active element
      initialActiveElement?.focus()
    }
  }, [])

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      data-nextjs-dialog
      data-nextjs-scrollable-content
      role={role}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-modal="true"
      className={className}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose?.()
        }
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export { Dialog }
