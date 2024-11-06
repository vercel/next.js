import * as React from 'react'

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
        e.preventDefault()
        return onClick?.()
      }}
      className={`nextjs-toast${className ? ' ' + className : ''}`}
    >
      <div data-nextjs-toast-wrapper>{children}</div>
    </div>
  )
}
