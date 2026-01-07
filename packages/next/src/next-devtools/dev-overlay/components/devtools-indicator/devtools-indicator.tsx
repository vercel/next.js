import './devtools-indicator.css'
import type { CSSProperties } from 'react'
import type { DevToolsIndicatorPosition } from '../../shared'
import { NextLogo } from './next-logo'
import { Toast } from '../toast'
import {
  MENU_CURVE,
  MENU_DURATION_MS,
} from '../errors/dev-tools-indicator/utils'
import {
  ACTION_DEVTOOLS_POSITION,
  STORE_KEY_SHARED_PANEL_LOCATION,
  STORAGE_KEY_PANEL_POSITION_PREFIX,
  ACTION_DEVTOOLS_PANEL_POSITION,
} from '../../shared'
import { Draggable } from '../errors/dev-tools-indicator/draggable'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { usePanelRouterContext } from '../../menu/context'
import { saveDevToolsConfig } from '../../utils/save-devtools-config'

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
          saveDevToolsConfig({ devToolsPosition: p })

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
  const { state, dispatch } = useDevOverlayContext()
  return (position: DevToolsIndicatorPosition) => {
    dispatch({
      type: ACTION_DEVTOOLS_PANEL_POSITION,
      devToolsPanelPosition: position,
      key: STORE_KEY_SHARED_PANEL_LOCATION,
    })

    const panelPositionKeys = Object.keys(state.devToolsPanelPosition).filter(
      (key) => key.startsWith(STORAGE_KEY_PANEL_POSITION_PREFIX)
    )

    const panelPositionPatch: Record<string, DevToolsIndicatorPosition> = {
      [STORE_KEY_SHARED_PANEL_LOCATION]: position,
    }

    panelPositionKeys.forEach((key) => {
      dispatch({
        type: ACTION_DEVTOOLS_PANEL_POSITION,
        devToolsPanelPosition: position,
        key,
      })

      panelPositionPatch[key] = position
    })

    saveDevToolsConfig({
      devToolsPanelPosition: panelPositionPatch,
    })
  }
}
