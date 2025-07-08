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
  STORAGE_KEY_POSITION,
  ACTION_DEVTOOLS_POSITION,
  ACTION_DEVTOOLS_PANEL_OPEN,
  ACTION_ERROR_OVERLAY_OPEN,
} from '../../shared'
import { Draggable } from '../errors/dev-tools-indicator/draggable'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { useRenderErrorContext } from '../../dev-overlay'
import { usePanelContext } from '../../menu/context'

export const INDICATOR_PADDING = 20

export function DevToolsIndicator() {
  const { state, dispatch } = useDevOverlayContext()
  const { setOpen } = usePanelContext()

  const [vertical, horizontal] = state.devToolsPosition.split('-', 2)

  // console.log('rendering next logo')

  return (
    // what is this toast doing??
    // why are u hiding my precious
    // <Toast
    //   data-nextjs-toast
    //   style={
    //     {
    //       '--animate-out-duration-ms': `${MENU_DURATION_MS}ms`,
    //       '--animate-out-timing-function': MENU_CURVE,
    //       boxShadow: 'none',
    //       [vertical]: `${INDICATOR_PADDING}px`,
    //       [horizontal]: `${INDICATOR_PADDING}px`,
    //       visibility:
    //         state.isDevToolsPanelOpen || state.isErrorOverlayOpen
    //           ? 'hidden'
    //           : 'visible',
    //     } as CSSProperties
    //   }
    // >
      <Draggable
        padding={INDICATOR_PADDING}
        // er i don't think this makes sense in the context of the refactor, come back to this
        onDragStart={() => setOpen(null)}
        position={state.devToolsPosition}
        setPosition={(p) => {
          dispatch({
            type: ACTION_DEVTOOLS_POSITION,
            devToolsPosition: p,
          })
          localStorage.setItem(STORAGE_KEY_POSITION, p)
        }}
      >
        {/* Trigger */}
        <NextLogo />
      </Draggable>
    // </Toast>
  )
}
