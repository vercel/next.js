import type { CSSProperties } from 'react'
import type { OverlayState, OverlayDispatch } from '../../shared'

import { useState } from 'react'
import { NextLogo } from './next-logo'
import { Toast } from '../toast'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../errors/dev-tools-indicator/utils'
import {
  ACTION_DEVTOOLS_PANEL_TOGGLE,
  ACTION_ERROR_OVERLAY_TOGGLE,
  ACTION_ERROR_OVERLAY_CLOSE,
  STORAGE_KEY_POSITION,
  ACTION_DEVTOOLS_PANEL_CLOSE,
  ACTION_DEVTOOLS_INDICATOR_POSITION,
} from '../../shared'
import { Draggable } from '../errors/dev-tools-indicator/draggable'

const INDICATOR_PADDING = 20

export function DevToolsIndicator({
  state,
  dispatch,
  errorCount,
  isBuildError,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  errorCount: number
  isBuildError: boolean
}) {
  const [open, setOpen] = useState(false)

  const [vertical, horizontal] = state.indicatorPosition.split('-', 2)

  const toggleErrorOverlay = () => {
    dispatch({ type: ACTION_DEVTOOLS_PANEL_CLOSE })
    dispatch({ type: ACTION_ERROR_OVERLAY_TOGGLE })
  }

  const toggleDevToolsPanel = () => {
    dispatch({ type: ACTION_ERROR_OVERLAY_CLOSE })
    dispatch({ type: ACTION_DEVTOOLS_PANEL_TOGGLE })
  }

  return (
    <Toast
      data-nextjs-toast
      style={
        {
          '--animate-out-duration-ms': `${MENU_DURATION_MS}ms`,
          '--animate-out-timing-function': MENU_CURVE,
          boxShadow: 'none',
          zIndex: 2147483647,
          [vertical]: `${INDICATOR_PADDING}px`,
          [horizontal]: `${INDICATOR_PADDING}px`,
        } as CSSProperties
      }
    >
      <Draggable
        padding={INDICATOR_PADDING}
        onDragStart={() => setOpen(false)}
        position={state.indicatorPosition}
        setPosition={(p) => {
          dispatch({
            type: ACTION_DEVTOOLS_INDICATOR_POSITION,
            indicatorPosition: p,
          })
          localStorage.setItem(STORAGE_KEY_POSITION, p)
        }}
      >
        {/* Trigger */}
        <NextLogo
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="nextjs-dev-tools-menu"
          aria-label={`${open ? 'Close' : 'Open'} Next.js Dev Tools`}
          data-nextjs-dev-tools-button
          disabled={state.disableDevIndicator}
          issueCount={errorCount}
          onTriggerClick={toggleDevToolsPanel}
          toggleErrorOverlay={toggleErrorOverlay}
          isDevBuilding={state.buildingIndicator}
          isDevRendering={state.renderingIndicator}
          isBuildError={isBuildError}
          scale={state.scale}
        />
      </Draggable>
    </Toast>
  )
}
