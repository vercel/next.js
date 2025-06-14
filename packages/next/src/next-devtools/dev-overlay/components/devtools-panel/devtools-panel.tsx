import type { OverlayDispatch, OverlayState } from '../../shared'

import { Suspense, useRef } from 'react'
import Draggable from 'next/dist/compiled/react-draggable'

import { Dialog, DialogContent, DialogHeader, DialogBody } from '../dialog'
import { Overlay } from '../overlay/overlay'
import { useFocusTrap } from '../errors/dev-tools-indicator/utils'
import { useDelayedRender } from '../../hooks/use-delayed-render'
import { ACTION_DEVTOOLS_PANEL_TOGGLE } from '../../shared'
import { css } from '../../utils/css'

export function DevToolsPanel({
  state,
  dispatch,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
}) {
  const dialogRef = useRef<HTMLDivElement>(null as unknown as HTMLDivElement)

  // This hook lets us do an exit animation before unmounting the component
  const { mounted, rendered } = useDelayedRender(state.isDevToolsPanelOpen)

  useFocusTrap(dialogRef, null, rendered)

  if (!mounted) {
    // Workaround React quirk that triggers "Switch to client-side rendering" if
    // we return no Suspense boundary here.
    return <Suspense />
  }

  const onClose = () => {
    dispatch({ type: ACTION_DEVTOOLS_PANEL_TOGGLE })
  }

  return (
    <Overlay data-nextjs-devtools-panel-overlay>
      <Draggable nodeRef={dialogRef}>
        <div data-nextjs-devtools-panel-container ref={dialogRef}>
          <Dialog
            data-nextjs-devtools-panel-dialog
            aria-labelledby="nextjs__container_dev_tools_panel_label"
            aria-describedby="nextjs__container_dev_tools_panel_desc"
            onClose={onClose}
          >
            <DialogContent>
              <DialogHeader></DialogHeader>
              <DialogBody></DialogBody>
            </DialogContent>
          </Dialog>
        </div>
      </Draggable>
    </Overlay>
  )
}

export const DEVTOOLS_PANEL_STYLES = css`
  [data-nextjs-devtools-panel-overlay] {
    padding: initial;
    top: 10vh;
  }

  [data-nextjs-devtools-panel-container] {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    box-shadow: var(--shadow-lg);
    position: relative;
    overflow: hidden;

    /* TODO: Remove once the content is filled. */
    min-width: 800px;
    min-height: 500px;

    /* This is handled from dialog/styles.ts */
    max-width: var(--next-dialog-max-width);
  }

  [data-nextjs-devtools-panel-dialog] {
    overflow-y: auto;
    height: 100%;
  }
`
