import * as React from 'react'

type DialogContentProps = {
  children?: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

const DialogContent: React.FC<DialogContentProps> = function DialogContent({
  children,
  className,
  ...props
}) {
  return (
    <div data-nextjs-dialog-content className={className} {...props}>
      {children}
    </div>
  )
}

export { DialogContent }
