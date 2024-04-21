import * as React from 'next/dist/compiled/react'

export type DialogHeaderProps = {
  children?: React.ReactNode
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
