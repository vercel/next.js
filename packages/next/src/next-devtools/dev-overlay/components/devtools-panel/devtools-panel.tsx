import type { OverlayDispatch, OverlayState } from '../../shared'

import { Suspense, useRef, useState } from 'react'
import Draggable from 'next/dist/compiled/react-draggable'

import { Dialog, DialogContent, DialogHeader, DialogBody } from '../dialog'
import { Overlay } from '../overlay/overlay'
import { useFocusTrap } from '../errors/dev-tools-indicator/utils'
import { useDelayedRender } from '../../hooks/use-delayed-render'
import { ACTION_DEVTOOLS_PANEL_TOGGLE } from '../../shared'
import { css } from '../../utils/css'
import { FullscreenIcon } from '../../icons/fullscreen'
import { Cross } from '../../icons/cross'

export function DevToolsPanel({
  state,
  dispatch,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
}) {
  const [activeTab, setActiveTab] = useState<'issues' | 'route' | 'settings'>(
    'settings'
  )

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
              <DialogHeader>
                <div data-nextjs-devtools-panel-header>
                  <div data-nextjs-devtools-panel-tabs>
                    <button
                      data-nextjs-devtools-panel-tab={activeTab === 'issues'}
                      onClick={() => setActiveTab('issues')}
                    >
                      Issues <span className="badge">1</span>
                    </button>
                    <button
                      data-nextjs-devtools-panel-tab={activeTab === 'route'}
                      onClick={() => setActiveTab('route')}
                    >
                      Route Info
                    </button>
                    <button
                      data-nextjs-devtools-panel-tab={activeTab === 'settings'}
                      onClick={() => setActiveTab('settings')}
                    >
                      Settings
                    </button>
                  </div>
                  <div data-nextjs-devtools-panel-action-buttons>
                    {/* TODO: Currently no-op, will add fullscreen toggle. */}
                    <button data-nextjs-devtools-panel-fullscreen-button>
                      <FullscreenIcon width={16} height={16} />
                    </button>
                    <button
                      data-nextjs-devtools-panel-close-button
                      onClick={onClose}
                    >
                      <Cross width={16} height={16} />
                    </button>
                  </div>
                </div>
              </DialogHeader>
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

  [data-nextjs-devtools-panel-header] {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-gray-300);
    background: var(--color-gray-100);
  }

  [data-nextjs-devtools-panel-tabs] {
    display: flex;
    align-items: center;
  }
`
