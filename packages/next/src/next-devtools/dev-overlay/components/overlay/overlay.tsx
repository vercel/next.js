import * as React from 'react'
import { lock, unlock } from './body-locker'

export type OverlayProps = React.HTMLAttributes<HTMLDivElement> & {
  fixed?: boolean
  ref?: React.Ref<HTMLDivElement>
}

const Overlay: React.FC<OverlayProps> = function Overlay({
  className,
  children,
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
      {children}
    </div>
  )
}

export { Overlay }
