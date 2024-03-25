export function DialogHeader({
  title,
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
  title: string
}) {
  return (
    <div data-nextjs-dialog-header className={className}>
      <h1>{title}</h1>
      {children}
    </div>
  )
}
