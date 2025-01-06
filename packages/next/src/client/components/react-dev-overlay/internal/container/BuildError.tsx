import * as React from 'react'
import type { VersionInfo } from '../../../../../server/dev/parse-version-info'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '../components/Dialog'
import { Overlay } from '../components/Overlay'
import { Terminal } from '../components/Terminal'
import { VersionStalenessInfo } from '../components/VersionStalenessInfo'
import { noop as css } from '../helpers/noop-template'

export type BuildErrorProps = { message: string; versionInfo?: VersionInfo }

export const BuildError: React.FC<BuildErrorProps> = function BuildError({
  message,
  versionInfo,
}) {
  const noop = React.useCallback(() => {}, [])
  return (
    <Overlay fixed>
      <Dialog
        type="error"
        aria-labelledby="nextjs__container_errors_label"
        aria-describedby="nextjs__container_errors_desc"
        onClose={noop}
      >
        <DialogContent>
          <DialogHeader className="nextjs-container-errors-header">
            <h1
              id="nextjs__container_errors_label"
              className="nextjs__container_errors_label"
            >
              {'Build Error'}
            </h1>
            <VersionStalenessInfo versionInfo={versionInfo} />
            <p
              id="nextjs__container_errors_desc"
              className="nextjs__container_errors_desc"
            >
              Failed to compile
            </p>
          </DialogHeader>
          <DialogBody className="nextjs-container-errors-body">
            <Terminal content={message} />
            <footer>
              <p id="nextjs__container_build_error_desc">
                <small>
                  This error occurred during the build process and can only be
                  dismissed by fixing the error.
                </small>
              </p>
            </footer>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Overlay>
  )
}

export const styles = css`
  h1.nextjs__container_errors_label {
    font-size: var(--size-font-big);
    line-height: var(--size-font-bigger);
    font-weight: bold;
    margin: var(--size-gap-double) 0;
  }
  .nextjs-container-errors-header p {
    font-size: var(--size-font-small);
    line-height: var(--size-font-big);
    white-space: pre-wrap;
  }
  .nextjs-container-errors-body footer {
    margin-top: var(--size-gap);
  }
  .nextjs-container-errors-body footer p {
    margin: 0;
  }

  .nextjs-container-errors-body small {
    color: var(--color-font);
  }
`
