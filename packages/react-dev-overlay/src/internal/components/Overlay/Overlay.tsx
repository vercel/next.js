import * as React from 'react'
import { lock, unlock } from './body-locker'

export type OverlayProps = { className?: string }

const Overlay: React.FC<OverlayProps> = function Overlay({
  className,
  children,
}) {
  React.useEffect(() => {
    lock()
    return () => {
      unlock()
    }
  }, [])

  return (
    <div data-nextjs-dialog-overlay className={className}>
      <div data-nextjs-dialog-backdrop />
      {children}
    </div>
  )
}

export { Overlay }
