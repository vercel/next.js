import * as React from 'react'

export type DialogHeaderProps = {
  className?: string
}

const DialogHeader: React.FC<DialogHeaderProps> = function DialogHeader({
  children,
  className,
}) {
  return (
    <div data-nextjs-dialog-header className={className}>
      {children}
    </div>
  )
}

export { DialogHeader }
