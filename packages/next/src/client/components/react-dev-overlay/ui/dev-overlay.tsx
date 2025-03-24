import type { OverlayState } from '../shared'

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

export function DevOverlay({
  state,
  isErrorOverlayOpen,
  setIsErrorOverlayOpen,
}: {
  state: OverlayState
  isErrorOverlayOpen: boolean
  setIsErrorOverlayOpen: (
    isErrorOverlayOpen: boolean | ((prev: boolean) => boolean)
  ) => void
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
          const isBuildError = runtimeErrors.length === 0
          return (
            <>
              <DevToolsIndicator
                scale={scale}
                setScale={setScale}
                state={state}
                errorCount={totalErrorCount}
                isBuildError={isBuildError}
                setIsErrorOverlayOpen={setIsErrorOverlayOpen}
              />

              <ErrorOverlay
                state={state}
                runtimeErrors={runtimeErrors}
                isErrorOverlayOpen={isErrorOverlayOpen}
                setIsErrorOverlayOpen={setIsErrorOverlayOpen}
              />
            </>
          )
        }}
      </RenderError>
    </ShadowPortal>
  )
}
