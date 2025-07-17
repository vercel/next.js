import './devtools-indicator.css'
import type { CSSProperties } from 'react'
import { NextLogo } from './next-logo'
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
  ACTION_DEVTOOLS_PANEL_POSITION,
} from '../../shared'
import { Draggable } from '../errors/dev-tools-indicator/draggable'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { usePanelRouterContext } from '../../menu/context'
import type { DevToolsIndicatorPosition } from '../errors/dev-tools-indicator/dev-tools-info/preferences'

export const INDICATOR_PADDING = 20

export function DevToolsIndicator() {
  const { state, dispatch } = useDevOverlayContext()
  const { panel, setPanel, setSelectedIndex } = usePanelRouterContext()
  const updateAllPanelPositions = useUpdateAllPanelPositions()
  const [vertical, horizontal] = state.devToolsPosition.split('-', 2)

  return (
    // TODO: why is this called a toast
    <Toast
      id="devtools-indicator"
      data-nextjs-toast
      style={
        {
          '--animate-out-duration-ms': `${MENU_DURATION_MS}ms`,
          '--animate-out-timing-function': MENU_CURVE,
          boxShadow: 'none',
          [vertical]: `${INDICATOR_PADDING}px`,
          [horizontal]: `${INDICATOR_PADDING}px`,
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

          updateAllPanelPositions(p)
        }}
      >
        <NextLogo
          onTriggerClick={() => {
            const newPanel =
              panel === 'panel-selector' ? null : 'panel-selector'
            setPanel(newPanel)
            if (!newPanel) {
              setSelectedIndex(-1)
              return
            }
          }}
        />
      </Draggable>
    </Toast>
  )
}

/**
 * makes sure we eventually sync the panel to the logo, otherwise
 * it will be jarring if the panels start appearing on the other
 * side of the logo. This wont teleport the panel because the indicator
 * cannot be dragged when any panel is open
 */
export const useUpdateAllPanelPositions = () => {
  const { dispatch } = useDevOverlayContext()
  return (position: DevToolsIndicatorPosition) => {
    dispatch({
      type: ACTION_DEVTOOLS_PANEL_POSITION,
      devToolsPanelPosition: position,
      key: STORE_KEY_SHARED_PANEL_LOCATION,
    })

    localStorage.setItem(STORE_KEY_SHARED_PANEL_LOCATION, position)

    const panelPositionKeys = Object.keys(localStorage).filter((key) =>
      key.startsWith(STORAGE_KEY_PANEL_POSITION_PREFIX)
    )

    panelPositionKeys.forEach((key) => {
      dispatch({
        type: ACTION_DEVTOOLS_PANEL_POSITION,
        devToolsPanelPosition: position,
        key,
      })
      localStorage.setItem(key, position)
    })
  }
}
