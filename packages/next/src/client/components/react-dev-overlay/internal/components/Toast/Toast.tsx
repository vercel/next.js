import * as React from 'react'

export type ToastProps = {
  children?: React.ReactNode
  onClick?: () => void
  className?: string
}

export const Toast: React.FC<ToastProps> = function Toast({
  onClick,
  children,
  className,
}) {
  return (
    <div
      data-nextjs-toast
      onClick={(e) => {
        e.preventDefault()
        return onClick?.()
      }}
      className={className}
    >
      <div data-nextjs-toast-wrapper>{children}</div>
    </div>
  )
}
