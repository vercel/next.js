import * as React from 'react'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '../components/Dialog'
import { Overlay } from '../components/Overlay'
import { Terminal } from '../components/Terminal'
import { noop as css } from '../helpers/noop-template'

export type FullRefreshWarningProps = { reason: string | null }

export const FullRefreshWarning: React.FC<FullRefreshWarningProps> =
  function FullRefreshWarning({ reason }) {
    const reload = React.useCallback(() => {
      window.location.reload()
    }, [])

    return (
      <Overlay fixed>
        <Dialog
          type="warning"
          aria-labelledby="nextjs__container_refresh_warning_label"
          aria-describedby="nextjs__container_refresh_warning_desc"
          onClose={reload}
        >
          <DialogContent>
            <DialogHeader className="nextjs-container-refresh-warning-header">
              <h4 id="nextjs__container_refresh_warning_label">
                About to perform a full refresh
              </h4>
            </DialogHeader>
            <DialogBody className="nextjs-container-refresh-warning-body">
              <FullRefreshWarningReason reason={reason} />
              <footer>
                <p>
                  You can read more about Fast Refresh in{' '}
                  <a href="https://nextjs.org/docs/basic-features/fast-refresh#how-it-works">
                    our documentation
                  </a>
                  .
                </p>
                <button onClick={reload}>Reload</button>
              </footer>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </Overlay>
    )
  }

export const styles = css`
  .nextjs-container-refresh-warning-header > h4 {
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  .nextjs-container-refresh-warning-body footer {
    margin-top: var(--size-gap-double);
  }

  .nextjs-container-build-error-body p {
    color: #757575;
  }

  .nextjs-container-refresh-warning-body button {
    background-color: var(--color-ansi-yellow);
    border: 0;
    border-radius: var(--size-gap-half);
    color: var(--color-ansi-black);
    cursor: pointer;
    display: block;
    margin-left: auto;
    padding: calc(var(--size-gap) + var(--size-gap-half))
      calc(var(--size-gap-double) + var(--size-gap-half));
    transition: background-color 0.25s ease;
  }

  .nextjs-container-refresh-warning-body button:hover {
    background-color: var(--color-ansi-bright-yellow);
  }
`

type FullRefreshBodyProps = {
  reason: string | null
}

const FullRefreshWarningReason = ({
  reason,
}: FullRefreshBodyProps): JSX.Element => {
  if (reason === null) {
    return (
      <p>
        Fast Refresh will perform a full reload because your application had an
        unrecoverable error.
      </p>
    )
  }

  return (
    <>
      <p>
        Fast Refresh will perform a full reload when you edit a file that is
        imported by modules outside of the React rendering tree. It is also
        possible the parent component of the component you edited is a class
        component, which disables Fast Refresh. Fast Refresh requires at least
        one parent function component in your React tree.
      </p>
      <p>You can find more information in the related Webpack error below:</p>
      <Terminal content={reason} />
    </>
  )
}
