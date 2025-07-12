import type { CSSProperties } from 'react'

import { NextLogoNew } from './next-logo'
import { Toast } from '../toast'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../errors/dev-tools-indicator/utils'
import {
  STORAGE_KEY_POSITION,
  ACTION_DEVTOOLS_POSITION,
  STORE_KEY_SHARED_PANEL_LOCATION,
  STORAGE_KEY_PANEL_POSITION_PREFIX,
} from '../../shared'
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
        // avoids a lot of weird edge cases that would cause jank if the logo and panel were de-synced
        disableDrag={panel !== null}
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

            onTriggerClick(newPanel)
            /**
             * makes sure we eventually sync the panel to the logo, otherwise
             * it will be jarring if the panels start appearing on the other
             * side of the logo
             */
            const sharedLocation = localStorage.getItem(
              STORE_KEY_SHARED_PANEL_LOCATION
            )
            if (sharedLocation) {
              const panelPositionKeys = Object.keys(localStorage).filter(
                (key) => key.startsWith(STORAGE_KEY_PANEL_POSITION_PREFIX)
              )

              panelPositionKeys.forEach((key) => {
                localStorage.setItem(key, sharedLocation)
              })
            }
          }}
          ref={triggerRef}
        />
      </Draggable>
    </Toast>
  )
}
