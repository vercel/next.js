import * as React from 'react'

export type DialogProps = {
  children?: React.ReactNode
  'aria-labelledby': string
  'aria-describedby': string
  className?: string
  onClose?: () => void
  dialogResizerRef?: React.RefObject<HTMLDivElement | null>
} & React.HTMLAttributes<HTMLDivElement>

const Dialog: React.FC<DialogProps> = function Dialog({
  children,
  className,
  onClose,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  dialogResizerRef,
  ...props
}) {
  const dialogRef = React.useRef<HTMLDivElement | null>(null)
  const [role, setRole] = React.useState<string | undefined>(
    typeof document !== 'undefined' && document.hasFocus()
      ? 'dialog'
      : undefined
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
      {children}
    </div>
  )
}

export { Dialog }
