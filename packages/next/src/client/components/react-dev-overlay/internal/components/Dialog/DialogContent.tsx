import * as React from 'react'

export type DialogContentProps = {
  children?: React.ReactNode
  className?: string
}

const DialogContent: React.FC<DialogContentProps> = function DialogContent({
  children,
  className,
}) {
  return (
    <div data-nextjs-dialog-content className={className}>
      {children}
    </div>
  )
}

export { DialogContent }
