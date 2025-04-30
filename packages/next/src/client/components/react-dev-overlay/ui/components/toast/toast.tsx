import * as React from 'react'
import { cx } from '../../utils/cx'
export type ToastProps = React.HTMLProps<HTMLDivElement> & {
  children?: React.ReactNode
  onClick?: () => void
  className?: string
}

export const Toast: React.FC<ToastProps> = function Toast({
  onClick,
  children,
  className,
  ...props
}) {
  return (
    <div
      {...props}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) {
          e.preventDefault()
        }
        return onClick?.()
      }}
      className={cx('nextjs-toast', className)}
    >
      <div data-nextjs-toast-wrapper>{children}</div>
    </div>
  )
}
