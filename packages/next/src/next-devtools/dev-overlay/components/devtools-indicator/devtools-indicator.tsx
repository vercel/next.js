import type { CSSProperties } from 'react'
import type { OverlayState, OverlayDispatch } from '../../shared'
import type { DevToolsScale } from '../errors/dev-tools-indicator/dev-tools-info/preferences'

import { useState } from 'react'
import { NextLogo } from './next-logo'
import { Toast } from '../toast'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../errors/dev-tools-indicator/utils'
import {
  ACTION_DEV_TOOLS_PANEL_TOGGLE,
  ACTION_ERROR_OVERLAY_TOGGLE,
  STORAGE_KEY_POSITION,
} from '../../shared'
import { getInitialPosition } from '../errors/dev-tools-indicator/dev-tools-info/preferences'
import { Draggable } from '../errors/dev-tools-indicator/draggable'

const INDICATOR_PADDING = 20

export function DevToolsIndicator({
  state,
  dispatch,
  errorCount,
  isBuildError,
  scale,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  errorCount: number
  isBuildError: boolean
  scale: DevToolsScale
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(getInitialPosition())

  const [vertical, horizontal] = position.split('-', 2)

  const toggleErrorOverlay = () => {
    dispatch({ type: ACTION_ERROR_OVERLAY_TOGGLE })
  }

  const toggleDevToolsPanel = () => {
    dispatch({ type: ACTION_DEV_TOOLS_PANEL_TOGGLE })
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
        position={position}
        setPosition={(p) => {
          localStorage.setItem(STORAGE_KEY_POSITION, p)
          setPosition(p)
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
          scale={scale}
        />
      </Draggable>
    </Toast>
  )
}
