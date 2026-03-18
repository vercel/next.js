import * as React from 'react'

type DialogBodyProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

const DialogBody: React.FC<DialogBodyProps> = function DialogBody({
  children,
  className,
  ...props
}) {
  return (
    <div data-nextjs-dialog-body className={className} {...props}>
      {children}
    </div>
  )
}

export { DialogBody }
