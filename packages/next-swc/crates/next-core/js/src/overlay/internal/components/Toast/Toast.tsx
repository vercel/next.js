import * as React from 'react'
import { clsx } from '../../helpers/clsx'

export type ToastProps = React.PropsWithChildren & {
  onClick?: (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  className?: string
}

export function Toast({
  onClick,
  children,
  className,
  ...rest
}: ToastProps & React.HTMLProps<HTMLDivElement>) {
  return (
    <div
      {...rest}
      data-nextjs-toast
      onClick={onClick}
      className={clsx('toast', className)}
    >
      <div data-nextjs-toast-wrapper className="toast-wrapper">
        {children}
      </div>
    </div>
  )
}
