import React from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '../components/Dialog'
import { Overlay } from '../components/Overlay'
import { Terminal } from '../components/Terminal'
import { noop as css } from '../helpers/noop-template'

export type RootLayoutErrorProps = { missingTags: string[] }

export const RootLayoutError: React.FC<RootLayoutErrorProps> =
  function BuildError({ missingTags }) {
    const message =
      'Please make sure to include the following tags in your root layout: <html>, <body>.\n\n' +
      `Missing required root layout tag${
        missingTags.length === 1 ? '' : 's'
      }: ` +
      missingTags.join(', ')

    const noop = React.useCallback(() => {}, [])
    return (
      <Overlay fixed>
        <Dialog
          type="error"
          aria-labelledby="nextjs__container_root_layout_error_label"
          aria-describedby="nextjs__container_root_layout_error_desc"
          onClose={noop}
        >
          <DialogContent>
            <DialogHeader className="nextjs-container-root-layout-error-header">
              <h4 id="nextjs__container_root_layout_error_label">
                Missing required tags
              </h4>
            </DialogHeader>
            <DialogBody className="nextjs-container-root-layout-error-body">
              <Terminal content={message} />
              <footer>
                <p id="nextjs__container_root_layout_error_desc">
                  <small>
                    This error and can only be dismissed by providing all
                    required tags.
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
  .nextjs-container-root-layout-error-header > h4 {
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  .nextjs-container-root-layout-error-body footer {
    margin-top: var(--size-gap);
  }
  .nextjs-container-root-layout-error-body footer p {
    margin: 0;
  }

  .nextjs-container-root-layout-error-body small {
    color: #757575;
  }
`
