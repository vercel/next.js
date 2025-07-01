import {
  ACTION_DEVTOOLS_PANEL_OPEN,
  ACTION_ERROR_OVERLAY_OPEN,
  type OverlayDispatch,
  type OverlayState,
} from './shared'

import { useState } from 'react'

import { ShadowPortal } from './components/shadow-portal'
import { Base } from './styles/base'
import { ComponentStyles } from './styles/component-styles'
import { CssReset } from './styles/css-reset'
import { Colors } from './styles/colors'
import { ErrorOverlay } from './components/errors/error-overlay/error-overlay'
import { DevToolsIndicator } from './components/errors/dev-tools-indicator/dev-tools-indicator'
import { RenderError } from './container/runtime-error/render-error'
import { DarkTheme } from './styles/dark-theme'
import { useDevToolsScale } from './components/errors/dev-tools-indicator/dev-tools-info/preferences'
import type { HydrationErrorState } from '../shared/hydration-error'
import { DevToolsIndicator as DevToolsIndicatorNew } from './components/devtools-indicator/devtools-indicator'
import { DevToolsPanel } from './components/devtools-panel/devtools-panel'

export function DevOverlay({
  state,
  dispatch,
  getSquashedHydrationErrorDetails,
}: {
  state: OverlayState
  dispatch: OverlayDispatch
  getSquashedHydrationErrorDetails: (error: Error) => HydrationErrorState | null
}) {
  const [scale, setScale] = useDevToolsScale()
  const [isPrevBuildError, setIsPrevBuildError] = useState(false)

  const isBuildError = state.buildError !== null

  if (
    process.env.__NEXT_DEVTOOL_NEW_PANEL_UI &&
    isBuildError !== isPrevBuildError
  ) {
    // If the build error is set, enable the devtools panel as the error overlay mode,
    // and the rest actions (close, minimize, fullscreen) can be handled by the user.
    if (isBuildError) {
      dispatch({ type: ACTION_DEVTOOLS_PANEL_OPEN })
      dispatch({ type: ACTION_ERROR_OVERLAY_OPEN })
    }
    setIsPrevBuildError(isBuildError)
  }

  return (
    <ShadowPortal>
      <CssReset />
      <Base
        scale={process.env.__NEXT_DEVTOOL_NEW_PANEL_UI ? state.scale : scale}
      />
      <Colors />
      <ComponentStyles />
      <DarkTheme />

      <RenderError state={state} dispatch={dispatch} isAppDir={true}>
        {({ runtimeErrors, totalErrorCount }) => {
          return (
            <>
              {state.showIndicator &&
                (process.env.__NEXT_DEVTOOL_NEW_PANEL_UI ? (
                  <>
                    <DevToolsIndicatorNew
                      state={state}
                      dispatch={dispatch}
                      errorCount={totalErrorCount}
                      isBuildError={isBuildError}
                    />

                    {(state.isDevToolsPanelOpen ||
                      state.isErrorOverlayOpen) && (
                      <DevToolsPanel
                        state={state}
                        dispatch={dispatch}
                        issueCount={totalErrorCount}
                        runtimeErrors={runtimeErrors}
                        getSquashedHydrationErrorDetails={
                          getSquashedHydrationErrorDetails
                        }
                      />
                    )}
                  </>
                ) : (
                  <>
                    <DevToolsIndicator
                      scale={scale}
                      setScale={setScale}
                      state={state}
                      dispatch={dispatch}
                      errorCount={totalErrorCount}
                      isBuildError={isBuildError}
                    />

                    <ErrorOverlay
                      state={state}
                      dispatch={dispatch}
                      getSquashedHydrationErrorDetails={
                        getSquashedHydrationErrorDetails
                      }
                      runtimeErrors={runtimeErrors}
                      errorCount={totalErrorCount}
                    />
                  </>
                ))}
            </>
          )
        }}
      </RenderError>
    </ShadowPortal>
  )
}
