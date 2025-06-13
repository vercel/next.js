import type { OverlayDispatch, OverlayState } from '../../shared'

import { Suspense, useRef, useState } from 'react'
import Draggable from 'next/dist/compiled/react-draggable'

import { Dialog, DialogContent, DialogHeader, DialogBody } from '../dialog'
import { Overlay } from '../overlay/overlay'
import { useFocusTrap } from '../errors/dev-tools-indicator/utils'
import { useDelayedRender } from '../../hooks/use-delayed-render'
import { ACTION_DEVTOOLS_PANEL_TOGGLE } from '../../shared'
import { css } from '../../utils/css'
import { FullScreenIcon } from '../../icons/fullscreen'
import { Cross } from '../../icons/cross'

export function DevToolsPanel({
  state,
  dispatch,
  issueCount,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  issueCount: number
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
                  <div data-nextjs-devtools-panel-tab-group>
                    <button
                      data-nextjs-devtools-panel-tab={activeTab === 'issues'}
                      onClick={() => setActiveTab('issues')}
                    >
                      Issues
                      <span data-nextjs-devtools-panel-tab-issues-badge>
                        {issueCount}
                      </span>
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
                  <div data-nextjs-devtools-panel-action-button-group>
                    {/* TODO: Currently no-op, will add fullscreen toggle. */}
                    <button data-nextjs-devtools-panel-action-button>
                      <FullScreenIcon width={16} height={16} />
                    </button>
                    <button
                      data-nextjs-devtools-panel-action-button
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
    border-bottom: 1px solid var(--color-gray-400);
  }

  [data-nextjs-devtools-panel-tab-group] {
    display: flex;
    align-items: center;
    padding: 8px;
    gap: 6px;
  }

  [data-nextjs-devtools-panel-tab] {
    display: flex;
    align-items: center;
    color: var(--color-gray-900);
    border-radius: var(--rounded-md-2);
    padding: 4px 12px;
    font-size: 14px;
    font-weight: 500;

    transition: all 0.2s ease;

    &:hover {
      background-color: var(--color-gray-200);
    }

    &:active {
      background-color: var(--color-gray-300);
    }
  }

  [data-nextjs-devtools-panel-tab='true'] {
    color: var(--color-gray-1000);
    background-color: var(--color-gray-100);
  }

  [data-nextjs-devtools-panel-tab-issues-badge] {
    display: inline-block;
    margin-left: 8px;
    background-color: var(--color-red-400);
    color: var(--color-red-900);
    font-size: 11px;
    border-radius: var(--rounded-full);
    padding: 2px 6px;
    width: 20px;
    height: 20px;
    font-weight: 500;
  }

  [data-nextjs-devtools-panel-action-button-group] {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
  }

  [data-nextjs-devtools-panel-action-button] {
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    color: var(--color-gray-600);
    border-radius: 4px;
    transition: all 0.2s ease;

    &:hover {
      background-color: var(--color-gray-200);
      color: var(--color-gray-900);
    }

    &:active {
      background-color: var(--color-gray-300);
    }
  }
`
