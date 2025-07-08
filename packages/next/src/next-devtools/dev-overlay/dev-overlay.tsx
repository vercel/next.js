import {
  ACTION_DEVTOOLS_PANEL_OPEN,
  ACTION_ERROR_OVERLAY_OPEN,
  type DispatcherEvent,
  type OverlayDispatch,
  type OverlayState,
} from './shared'

import { createContext, useContext, useState, type ActionDispatch } from 'react'

import { ShadowPortal } from './components/shadow-portal'
import { Base } from './styles/base'
import { ComponentStyles } from './styles/component-styles'
import { CssReset } from './styles/css-reset'
import { Colors } from './styles/colors'
import { ErrorOverlay } from './components/errors/error-overlay/error-overlay'
import {
  DevToolsIndicator,
  type Overlays,
} from './components/errors/dev-tools-indicator/dev-tools-indicator'
import { RenderError } from './container/runtime-error/render-error'
import { DarkTheme } from './styles/dark-theme'
import { useDevToolsScale } from './components/errors/dev-tools-indicator/dev-tools-info/preferences'
import type { HydrationErrorState } from '../shared/hydration-error'
import { DevToolsIndicator as DevToolsIndicatorNew } from './components/devtools-indicator/devtools-indicator'
import { DevToolsPanel } from './components/devtools-panel/devtools-panel'
import type { ReadyRuntimeError } from './utils/get-error-by-type'
import { useDevOverlayContext } from '../dev-overlay.browser'
import { PanelRouter } from './menu/panel-router'
import { PanelContext, type PanelStateKind } from './menu/context'

const RenderErrorContext = createContext<{
  runtimeErrors: ReadyRuntimeError[]
  totalErrorCount: number
}>(null!)

export const useRenderErrorContext = () => useContext(RenderErrorContext)

export function DevOverlay() {
  const { dispatch, getSquashedHydrationErrorDetails, state } =
    useDevOverlayContext()
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
  const [panel, setPanel] = useState<PanelStateKind | null>(null)
  console.log('panel state', panel)
  const [open, setOpen] = useState<Overlays | null>(null)

  // @ts-expect-error
  process.env.__NEXT_DEVTOOL_NEW_PANEL_UI = true
  return (
    <ShadowPortal>
      <CssReset />
      <Base
        scale={process.env.__NEXT_DEVTOOL_NEW_PANEL_UI ? state.scale : scale}
      />
      <Colors />
      <ComponentStyles />
      <DarkTheme />

      {/* todo: render error should provide this context, probably shouldn't have render props at all tbh */}
      <RenderError state={state} dispatch={dispatch} isAppDir={true}>
        {({ runtimeErrors, totalErrorCount }) => {
          return (
            <PanelContext
              value={{
                panel,
                setPanel,
                open,
                setOpen,
              }}
            >
              <RenderErrorContext value={{ runtimeErrors, totalErrorCount }}>
                {state.showIndicator &&
                  (process.env.__NEXT_DEVTOOL_NEW_PANEL_UI ? (
                    <>
                      <PanelRouter />

                      <DevToolsIndicatorNew />
                      {/* <DevToolsIndicatorNew
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
                    )} */}
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
              </RenderErrorContext>
            </PanelContext>
          )
        }}
      </RenderError>
    </ShadowPortal>
  )
}
