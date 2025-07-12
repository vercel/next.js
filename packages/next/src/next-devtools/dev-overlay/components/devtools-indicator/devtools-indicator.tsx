import type { CSSProperties } from 'react'

import { NextLogoNew } from './next-logo'
import { Toast } from '../toast'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../errors/dev-tools-indicator/utils'
import { STORAGE_KEY_POSITION, ACTION_DEVTOOLS_POSITION } from '../../shared'
import { Draggable } from '../errors/dev-tools-indicator/draggable'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { usePanelRouterContext } from '../../menu/context'
import { flushSync } from 'react-dom'

export const INDICATOR_PADDING = 20

export function DevToolsIndicatorNew() {
  const { state, dispatch } = useDevOverlayContext()
  const { triggerRef, panel, setPanel, onTriggerClick } =
    usePanelRouterContext()

  const [vertical, horizontal] = state.devToolsPosition.split('-', 2)

  return (
    // TODO: why is this called a toast
    <Toast
      data-nextjs-toast
      style={
        {
          '--animate-out-duration-ms': `${MENU_DURATION_MS}ms`,
          '--animate-out-timing-function': MENU_CURVE,
          boxShadow: 'none',
          [vertical]: `${INDICATOR_PADDING}px`,
          [horizontal]: `${INDICATOR_PADDING}px`,
          visibility: state.isErrorOverlayOpen ? 'hidden' : 'visible',
        } as CSSProperties
      }
    >
      <Draggable
        padding={INDICATOR_PADDING}
        position={state.devToolsPosition}
        setPosition={(p) => {
          dispatch({
            type: ACTION_DEVTOOLS_POSITION,
            devToolsPosition: p,
          })
          localStorage.setItem(STORAGE_KEY_POSITION, p)
        }}
      >
        <NextLogoNew
          onTriggerClick={() => {
            const newPanel =
              panel === 'panel-selector' ? null : 'panel-selector'
            flushSync(() => {
              setPanel(newPanel)
            })
            console.log('current panel', panel)

            onTriggerClick(newPanel)
          }}
          ref={triggerRef}
        />
      </Draggable>
    </Toast>
  )
}
