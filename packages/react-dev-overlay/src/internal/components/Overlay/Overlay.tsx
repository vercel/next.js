import * as React from 'react'
import FocusTrap from 'focus-trap-react'
import { lock, unlock } from './body-locker'

export type OverlayProps = { className?: string; fixed?: boolean }

const Overlay: React.FC<OverlayProps> = function Overlay({
  className,
  children,
  fixed,
}) {
  React.useEffect(() => {
    lock()
    return () => {
      unlock()
    }
  }, [])

  return (
    <FocusTrap>
      <div data-nextjs-dialog-overlay className={className}>
        <div
          // focus-trap-react requires at least one tabbable element
          // (determined by tabbable js)
          // This guarantees one element will be focusable.
          tabIndex={0}
          data-nextjs-dialog-backdrop
          data-nextjs-dialog-backdrop-fixed={fixed ? true : undefined}
        />
        {children}
      </div>
    </FocusTrap>
  )
}

export { Overlay }
