import * as React from 'react'

export type OverlayProps = { className?: string }

const Overlay: React.FC<OverlayProps> = function Overlay({
  className,
  children,
}) {
  return (
    <div data-nextjs-dialog-overlay className={className}>
      <div data-nextjs-dialog-backdrop />
      {children}
    </div>
  )
}

export { Overlay }
