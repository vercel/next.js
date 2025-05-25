import * as React from 'react'
import { lock, unlock } from './body-locker'

export type OverlayProps = {
  children?: React.ReactNode
  className?: string
  fixed?: boolean
  onClose?: () => void
}

const Overlay: React.FC<OverlayProps> = function Overlay({
  className,
  children,
  fixed,
  onClose,
  ...props
}) {
  React.useEffect(() => {
    lock()
    return () => {
      unlock()
    }
  }, [])

  return (
    <div data-nextjs-dialog-overlay className={className} {...props}>
      <div
        data-nextjs-dialog-backdrop
        onClick={onClose}
        data-nextjs-dialog-backdrop-fixed={fixed ? true : undefined}
      />
      {children}
    </div>
  )
}

export { Overlay }
