import * as React from 'react'
import { cx } from '../../utils/cx'
type ToastProps = React.HTMLProps<HTMLDivElement> & {
  children?: React.ReactNode
  onClick?: () => void
  className?: string
}

export const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  function Toast({ onClick, children, className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a')) {
            e.preventDefault()
          }
          return onClick?.()
        }}
        className={cx('nextjs-toast', className)}
      >
        {children}
      </div>
    )
  }
)
