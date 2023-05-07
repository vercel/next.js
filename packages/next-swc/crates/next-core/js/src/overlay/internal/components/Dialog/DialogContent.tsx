import * as React from 'react'

import { clsx } from '../../helpers/clsx'
import { noop as css } from '../../helpers/noop-template'

export type DialogContentProps = {
  className?: string
  children?: React.ReactNode
} & React.HTMLProps<HTMLDivElement>

export function DialogContent({
  className,
  children,
  ...rest
}: DialogContentProps) {
  return (
    <div className={clsx('dialog-content', className)} {...rest}>
      {children}
    </div>
  )
}

export const styles = css`
  .dialog-content {
    display: flex;
    flex-direction: column;

    overflow-y: hidden;
    border: none;
    margin: 0;
    padding: 0;

    height: 100%;
  }
`
