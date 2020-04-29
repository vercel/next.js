import * as React from 'react'
import { useOnClickOutside } from '../../hooks/use-on-click-outside'

export type DialogProps = {
  type: 'error' | 'warning'
  'aria-labelledby': string
  'aria-describedby': string
  onClose: (e: MouseEvent | TouchEvent) => void
}

const Dialog: React.FC<DialogProps> = function Dialog({
  children,
  type,
  onClose,
  ...props
}) {
  const [dialog, setDialog] = React.useState<HTMLDivElement>(null)
  const onDialog = React.useCallback(node => {
    setDialog(node)
  }, [])
  useOnClickOutside(dialog, onClose)

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
