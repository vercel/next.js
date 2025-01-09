export type DialogFooterProps = {
  children?: React.ReactNode
  className?: string
}

export function DialogFooter({ children, className }: DialogFooterProps) {
  return (
    <div data-nextjs-dialog-footer className={className}>
      {children}
    </div>
  )
}
