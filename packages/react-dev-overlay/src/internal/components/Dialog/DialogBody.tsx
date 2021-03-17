import * as React from 'react'

export type DialogBodyProps = {
  className?: string
}

const DialogBody: React.FC<DialogBodyProps> = function DialogBody({
  children,
  className,
}) {
  return (
    <div data-nextjs-dialog-body className={className}>
      {children}
    </div>
  )
}

export { DialogBody }
