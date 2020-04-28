import * as React from 'react'

export type DialogProps = {
  'aria-labelledby': string
  'aria-describedby': string
}

const Dialog: React.FC<DialogProps> = function Dialog({ children, ...props }) {
  return (
    <div
      data-nextjs-dialog
      tabIndex={-1}
      role="dialog"
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']}
      aria-modal="true"
    >
      {children}
    </div>
  )
}

export { Dialog }
