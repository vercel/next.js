import * as React from 'react'

export type DialogProps = {
  type: 'error'
  'aria-labelledby': string
  'aria-describedby': string
}

const Dialog: React.FC<DialogProps> = function Dialog({
  children,
  type,
  ...props
}) {
  return (
    <div
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
