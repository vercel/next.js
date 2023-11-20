import * as React from 'react'

import { DialogBody } from '../components/Dialog'
import { Terminal } from '../components/Terminal'
import { LeftRightDialogHeader } from '../components/LeftRightDialogHeader'
import type { DialogBodyProps } from '../components/Dialog'

import { noop as css } from '../helpers/noop-template'
import { clsx } from '../helpers/clsx'

import { usePagination } from '../hooks/use-pagination'

import type { BuildError } from './Errors'

type BuildErrorDialogBodyProps = {
  items: BuildError[]
  message: string
  'data-hidden'?: boolean
}

export function BuildErrorsDialogBody({
  items: buildErrors,
  message,
  'data-hidden': hidden = false,
  className,
  ...rest
}: BuildErrorDialogBodyProps &
  Omit<DialogBodyProps, 'children'>): React.ReactNode {
  const [activeError, { previous, next }, activeIdx] =
    usePagination(buildErrors)

  if (buildErrors.length < 1 || activeError == null) {
    return (
      <DialogBody
        {...rest}
        data-hidden={hidden}
        className={clsx('build-errors', className)}
      />
    )
  }

  return (
    <DialogBody
      {...rest}
      data-hidden={hidden}
      className={clsx('build-errors', className)}
    >
      <div className="title-pagination">
        <h1 id="nextjs__container_errors_label">{message}</h1>

        <LeftRightDialogHeader
          hidden={hidden}
          previous={activeIdx > 0 ? previous : null}
          next={activeIdx < buildErrors.length - 1 ? next : null}
          severity="error"
        >
          <small>
            <span>{activeIdx + 1}</span> of <span>{buildErrors.length}</span>
          </small>
        </LeftRightDialogHeader>
      </div>

      <Terminal content={activeError.message} />

      <footer>
        <p id="nextjs__container_errors_desc">
          <small>
            This error occurred during the build process and can only be
            dismissed by fixing the error.
          </small>
        </p>
      </footer>
    </DialogBody>
  )
}

export const styles = css`
  .build-errors footer {
    margin-top: var(--size-gap);
  }

  .build-errors footer p {
    margin: 0;
  }

  .build-errors small {
    color: #757575;
  }
`
