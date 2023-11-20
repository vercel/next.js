import * as React from 'react'

import { DialogBody } from '../components/Dialog'
import { Terminal } from '../components/Terminal'

import type { DialogBodyProps } from '../components/Dialog/DialogBody'
import { clsx } from '../helpers/clsx'
import { noop as css } from '../helpers/noop-template'

type RootLayoutErrorDialogBodyProps = {
  items: [{ missingTags: string[] }]
  message: string
  'data-hidden'?: boolean
}

export function RootLayoutErrorDialogBody({
  items,
  message,
  'data-hidden': hidden = false,
  className,
  ...rest
}: RootLayoutErrorDialogBodyProps &
  Omit<DialogBodyProps, 'children'>): React.ReactNode {
  const missingTags = items[0].missingTags

  const content =
    'Please make sure to include the following tags in your root layout: <html>, <body>.\n\n' +
    `Missing required root layout tag${missingTags.length === 1 ? '' : 's'}: ` +
    missingTags.join(', ')

  return (
    <DialogBody
      {...rest}
      data-hidden={hidden}
      className={clsx('root-layout-error', className)}
    >
      <div className="title-pagination">
        <h1 id="nextjs__container_errors_label">{message}</h1>
      </div>
      <Terminal content={content} />
      <footer>
        <p id="nextjs__container_errors_desc">
          <small>
            This error and can only be dismissed by providing all required tags.
          </small>
        </p>
      </footer>
    </DialogBody>
  )
}

export const styles = css`
  .root-layout-error footer {
    margin-top: var(--size-gap);
  }

  .root-layout-error footer p {
    margin: 0;
  }

  .root-layout-error small {
    color: #757575;
  }
`
