import type { OverlayDispatch, OverlayState, Corners } from '../../shared'
import type { ReadyRuntimeError } from '../../utils/get-error-by-type'
import type { HydrationErrorState } from '../../../shared/hydration-error'

import { useState, useEffect } from 'react'

import { DevToolsPanelFooter } from './devtools-panel-footer'
import { DevToolsPanelTab } from './devtools-panel-tab/devtools-panel-tab'
import { Dialog, DialogContent, DialogHeader, DialogBody } from '../dialog'
import { Overlay } from '../overlay/overlay'
import {
  ACTION_DEVTOOLS_PANEL_CLOSE,
  ACTION_DEVTOOLS_POSITION,
  ACTION_DEVTOOLS_SCALE,
  STORAGE_KEY_SCALE,
  STORAGE_KEY_POSITION,
  ACTION_ERROR_OVERLAY_CLOSE,
  STORAGE_KEY_ACTIVE_TAB,
} from '../../shared'
import { css } from '../../utils/css'
import { OverlayBackdrop } from '../overlay'
import { Draggable } from '../errors/dev-tools-indicator/draggable'
import { INDICATOR_PADDING } from '../devtools-indicator/devtools-indicator'
import { FullScreenIcon } from '../../icons/fullscreen'
import { Cross } from '../../icons/cross'
import { MinimizeIcon } from '../../icons/minimize'

export type DevToolsPanelTabType = 'issues' | 'route' | 'settings'

function useSessionState<T extends string>(
  key: string,
  initialValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (
      typeof window !== 'undefined' &&
      typeof sessionStorage !== 'undefined'
    ) {
      const stored = sessionStorage.getItem(key)
      return (stored as T) ?? initialValue
    }
    return initialValue
  })
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      typeof sessionStorage !== 'undefined'
    ) {
      sessionStorage.setItem(key, value)
    }
  }, [key, value])
  return [value, setValue]
}

export function DevToolsPanel({
  state,
  dispatch,
  issueCount,
  runtimeErrors,
  getSquashedHydrationErrorDetails,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  issueCount: number
  runtimeErrors: ReadyRuntimeError[]
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
}) {
  // Initialize active tab from session storage, fallback to 'issues'
  const [activeTab, setActiveTab] = useSessionState<DevToolsPanelTabType>(
    STORAGE_KEY_ACTIVE_TAB,
    'issues'
  )

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [prevIsErrorOverlayOpen, setPrevIsErrorOverlayOpen] = useState(false)

  if (state.isErrorOverlayOpen !== prevIsErrorOverlayOpen) {
    if (state.isErrorOverlayOpen) {
      setIsFullscreen(true)
      // We should always show the issues tab initially if we're
      // programmatically opening the panel to highlight errors.
      setActiveTab('issues')
    }
    setPrevIsErrorOverlayOpen(state.isErrorOverlayOpen)
  }

  const [vertical, horizontal] = state.devToolsPosition.split('-', 2)

  const onCloseDevToolsPanel = () => {
    dispatch({ type: ACTION_DEVTOOLS_PANEL_CLOSE })
    dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
  }

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({
      type: ACTION_DEVTOOLS_POSITION,
      devToolsPosition: e.target.value as Corners,
    })
    localStorage.setItem(STORAGE_KEY_POSITION, e.target.value)
  }

  const handleScaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({
      type: ACTION_DEVTOOLS_SCALE,
      scale: Number(e.target.value),
    })
    localStorage.setItem(STORAGE_KEY_SCALE, e.target.value)
  }

  const handleFullscreenToggle = () => {
    setIsFullscreen((prev) => !prev)
    dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
  }

  return (
    <Overlay
      data-nextjs-devtools-panel-overlay
      style={
        !isFullscreen
          ? {
              [vertical]: `${INDICATOR_PADDING}px`,
              [horizontal]: `${INDICATOR_PADDING}px`,
              [vertical === 'top' ? 'bottom' : 'top']: 'auto',
              [horizontal === 'left' ? 'right' : 'left']: 'auto',
            }
          : {}
      }
    >
      {/* TODO: Investigate why onCloseDevToolsPanel on Dialog doesn't close when clicked outside. */}
      <OverlayBackdrop
        data-nextjs-devtools-panel-overlay-backdrop={isFullscreen}
        onClick={onCloseDevToolsPanel}
      />
      <Draggable
        data-nextjs-devtools-panel-draggable
        padding={INDICATOR_PADDING}
        onDragStart={() => {}}
        position={state.devToolsPosition}
        setPosition={(p) => {
          localStorage.setItem(STORAGE_KEY_POSITION, p)
          dispatch({
            type: ACTION_DEVTOOLS_POSITION,
            devToolsPosition: p,
          })
        }}
        dragHandleSelector="[data-nextjs-devtools-panel-header], [data-nextjs-devtools-panel-footer]"
        disableDrag={isFullscreen}
      >
        <>
          <Dialog
            data-nextjs-devtools-panel-dialog
            aria-labelledby="nextjs__container_dev_tools_panel_label"
            aria-describedby="nextjs__container_dev_tools_panel_desc"
            onClose={onCloseDevToolsPanel}
          >
            <DialogContent data-nextjs-devtools-panel-dialog-content>
              <DialogHeader data-nextjs-devtools-panel-dialog-header>
                <div
                  data-nextjs-devtools-panel-header
                  data-nextjs-devtools-panel-draggable={!isFullscreen}
                >
                  <div data-nextjs-devtools-panel-header-tab-group>
                    <button
                      data-nextjs-devtools-panel-header-tab={
                        activeTab === 'issues'
                      }
                      onClick={() => setActiveTab('issues')}
                    >
                      Issues
                      {issueCount > 0 ? (
                        <span
                          data-nextjs-devtools-panel-header-tab-issues-badge
                        >
                          {issueCount}
                        </span>
                      ) : null}
                    </button>
                    <button
                      data-nextjs-devtools-panel-header-tab={
                        activeTab === 'route'
                      }
                      onClick={() => setActiveTab('route')}
                    >
                      Route Info
                    </button>
                    <button
                      data-nextjs-devtools-panel-header-tab={
                        activeTab === 'settings'
                      }
                      onClick={() => setActiveTab('settings')}
                    >
                      Settings
                    </button>
                  </div>
                  <div data-nextjs-devtools-panel-header-action-button-group>
                    <button
                      data-nextjs-devtools-panel-header-action-button
                      onClick={handleFullscreenToggle}
                    >
                      {isFullscreen ? (
                        <MinimizeIcon width={16} height={16} />
                      ) : (
                        <FullScreenIcon width={16} height={16} />
                      )}
                    </button>
                    <button
                      data-nextjs-devtools-panel-header-action-button
                      onClick={onCloseDevToolsPanel}
                    >
                      <Cross width={16} height={16} />
                    </button>
                  </div>
                </div>
              </DialogHeader>
              <DialogBody data-nextjs-devtools-panel-dialog-body>
                <DevToolsPanelTab
                  page={state.page}
                  activeTab={activeTab}
                  devToolsPosition={state.devToolsPosition}
                  scale={state.scale}
                  routerType={state.routerType}
                  handlePositionChange={handlePositionChange}
                  handleScaleChange={handleScaleChange}
                  debugInfo={state.debugInfo}
                  runtimeErrors={runtimeErrors}
                  getSquashedHydrationErrorDetails={
                    getSquashedHydrationErrorDetails
                  }
                  buildError={state.buildError}
                />
              </DialogBody>
            </DialogContent>
            <DevToolsPanelFooter
              versionInfo={state.versionInfo}
              isDraggable={!isFullscreen}
              showRestartServerButton={state.showRestartServerButton}
            />
          </Dialog>
        </>
      </Draggable>
    </Overlay>
  )
}

export const DEVTOOLS_PANEL_STYLES = css`
  /* TODO: Better override dialog header style. This conflicts with issues tab content. */
  [data-nextjs-devtools-panel-dialog-header] {
    margin-bottom: 0 !important;
  }

  [data-nextjs-devtools-panel-dialog-content] {
    /* Make DialogContent expand to push footer to bottom. */
    flex: 1;
    /* Hide overflow of devtools panel dialog since we want it on the dialog body only. */
    overflow: hidden;
  }

  [data-nextjs-devtools-panel-dialog-body] {
    overflow: auto;
    /* Make DialogBody a flex container so its children can expand. */
    display: flex;
    flex-direction: column;
  }

  [data-nextjs-devtools-panel-overlay] {
    margin: auto;
    width: 100%;

    @media (max-width: 575px) {
      left: 20px !important;
      right: 20px !important;
      width: auto;
    }

    @media (min-width: 576px) {
      max-width: 540px;
    }

    @media (min-width: 768px) {
      max-width: 720px;
    }

    @media (min-width: 992px) {
      max-width: 920px;
    }
  }

  [data-nextjs-devtools-panel-overlay-backdrop] {
    opacity: 0;
    visibility: hidden;
  }

  [data-nextjs-devtools-panel-overlay-backdrop='true'] {
    opacity: 1;
    visibility: visible;
  }

  [data-nextjs-devtools-panel-draggable] {
    /* For responsiveness */
    width: 100%;
  }

  [data-nextjs-devtools-panel-dialog] {
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    background: var(--color-background-100);
    background-clip: padding-box;
    border: 1px solid var(--color-gray-400);
    border-radius: var(--rounded-xl);
    box-shadow: var(--shadow-lg);
    position: relative;
    width: 100%;
    height: 350px;

    @media (min-width: 768px) {
      height: 450px;
    }
  }

  [data-nextjs-devtools-panel-header] {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-gray-400);
  }

  [data-nextjs-devtools-panel-header-tab-group] {
    display: flex;
    align-items: center;
    padding: 8px;
    gap: 6px;
  }

  [data-nextjs-devtools-panel-header-tab] {
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

  [data-nextjs-devtools-panel-header-tab='true'] {
    color: var(--color-gray-1000);
    background-color: var(--color-gray-100);
  }

  [data-nextjs-devtools-panel-header-tab-issues-badge] {
    display: flex;
    align-items: center;
    justify-content: center;
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

  [data-nextjs-devtools-panel-header-action-button-group] {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
  }

  [data-nextjs-devtools-panel-header-action-button] {
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    color: var(--color-gray-1000);
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

  [data-nextjs-devtools-panel-draggable='true'] {
    cursor: move;
    user-select: none;
    & > * {
      cursor: auto;
      /* user-select: auto; follows the parent (parent none -> child none), so reset the direct child to text */
      user-select: text;
    }
  }
`
