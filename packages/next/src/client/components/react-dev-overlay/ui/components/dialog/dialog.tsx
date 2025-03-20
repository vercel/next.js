import * as React from 'react'
import { useOnClickOutside } from '../../hooks/use-on-click-outside'
import { useMeasureHeight } from '../../hooks/use-measure-height'

export type DialogProps = {
  children?: React.ReactNode
  type: 'error' | 'warning'
  'aria-labelledby': string
  'aria-describedby': string
  className?: string
  onClose?: () => void
  dialogResizerRef?: React.RefObject<HTMLDivElement | null>
  footer?: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>

const CSS_SELECTORS_TO_EXCLUDE_ON_CLICK_OUTSIDE = [
  '[data-next-mark]',
  '[data-issues-open]',
  '#nextjs-dev-tools-menu',
  '[data-nextjs-error-overlay-nav]',
  '[data-info-popover]',
]

const Dialog: React.FC<DialogProps> = function Dialog({
  children,
  type,
  className,
  onClose,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  dialogResizerRef,
  footer,
  ...props
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null)
  const [role, setRole] = React.useState<string | undefined>(
    typeof document !== 'undefined' && document.hasFocus()
      ? 'dialog'
      : undefined
  )

  const ref = React.useRef<HTMLDivElement | null>(null)
  const [height, pristine] = useMeasureHeight(ref)

  useOnClickOutside(
    dialogRef.current,
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
      <div
        ref={dialogResizerRef}
        data-nextjs-dialog-sizer
        // [x] Don't animate on initial load
        // [x] No duplicate elements
        // [x] Responds to content growth
        style={{
          height,
          transition: pristine ? undefined : 'height 250ms var(--timing-swift)',
        }}
      >
        <div ref={ref}>{children}</div>
      </div>
      {footer}
    </div>
  )
}

export { Dialog }
