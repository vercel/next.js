import * as React from 'react'
import { clsx } from '../../helpers/clsx'
import { noop as css } from '../../helpers/noop-template'

export type DialogBodyProps = {
  className?: string
  children?: React.ReactNode
} & React.HTMLProps<HTMLDivElement>

export function DialogBody({ children, className, ...rest }: DialogBodyProps) {
  return (
    <div className={clsx('dialog-body', className)} {...rest}>
      {children}
    </div>
  )
}

export const styles = css`
  .dialog-content > .dialog-body {
    position: relative;
    flex: 1 1 auto;
    padding: var(--size-gap-double);
  }
`
