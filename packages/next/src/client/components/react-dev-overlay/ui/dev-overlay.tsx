import type { OverlayDispatch, OverlayState } from '../shared'

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
import type { HydrationErrorState } from '../pages/hydration-error-state'

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
  return (
    <ShadowPortal>
      <CssReset />
      <Base scale={scale} />
      <Colors />
      <ComponentStyles />
      <DarkTheme />

      <RenderError state={state} isAppDir={true}>
        {({ runtimeErrors, totalErrorCount }) => {
          const isBuildError = state.buildError !== null
          return (
            <>
              {state.showIndicator && (
                <DevToolsIndicator
                  scale={scale}
                  setScale={setScale}
                  state={state}
                  dispatch={dispatch}
                  errorCount={totalErrorCount}
                  isBuildError={isBuildError}
                />
              )}

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
          )
        }}
      </RenderError>
    </ShadowPortal>
  )
}
