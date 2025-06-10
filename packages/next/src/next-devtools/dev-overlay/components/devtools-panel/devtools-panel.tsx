
import type { OverlayDispatch, OverlayState } from '../../shared'

import { Suspense, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDivElement>(null)

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
    <Overlay className="p-0 top-[10vh]">
      <div
        data-nextjs-devtools-panel
        ref={dialogRef}
      >
        <Dialog
          aria-labelledby="nextjs__container_dev_tools_panel_label"
          aria-describedby="nextjs__container_dev_tools_panel_desc"
          className="dev-tools-panel-dialog-scroll"
          onClose={onClose}
        >
          <DialogContent>
            <DialogHeader></DialogHeader>
            <DialogBody>
              <div>DevToolsPanel</div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      </div>
    </Overlay>
  )
}

export const DEVTOOLS_PANEL_STYLES = css`
  [data-nextjs-devtools-panel] {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: var(--next-dialog-border-width) solid var(--color-gray-400);
    border-radius: 0 0 var(--next-dialog-radius) var(--next-dialog-radius);
    box-shadow: var(--shadow-menu);
    position: relative;
    overflow: hidden;

    /* TODO: Better styling. This is a prototype. */
    min-width: 800px;
    min-height: 500px;
  }

  .dev-tools-panel-dialog-scroll {
    overflow-y: auto;
    height: 100%;
  }
`
