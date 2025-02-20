import type { OverlayState } from '../shared'
import type { GlobalErrorComponent } from '../../error-boundary'

import { useState } from 'react'
import { DevOverlayErrorBoundary } from './error-boundary'
import { ShadowPortal } from '../_internal/components/shadow-portal'
import { Base } from '../_internal/styles/base'
import { ComponentStyles } from '../_internal/styles/component-styles'
import { CssReset } from '../_internal/styles/css-reset'
import { Colors } from '../_internal/styles/colors'
import { ErrorOverlay } from '../_internal/components/errors/error-overlay/error-overlay'
import { DevToolsIndicator } from '../_internal/components/errors/dev-tools-indicator/dev-tools-indicator'
import { RenderError } from '../_internal/container/runtime-error/render-error'

import { FontStyles } from '../_internal/font/font-styles'

export default function ReactDevOverlay({
  state,
  globalError,
  children,
}: {
  state: OverlayState
  globalError: [GlobalErrorComponent, React.ReactNode]
  children: React.ReactNode
}) {
  const [isErrorOverlayOpen, setIsErrorOverlayOpen] = useState(false)

  const devOverlay = (
    <>
      {/* Fonts can only be loaded outside the Shadow DOM. */}
      <FontStyles />
      <ShadowPortal>
        <CssReset />
        <Base />
        <Colors />
        <ComponentStyles />

        <RenderError state={state} isAppDir={true}>
          {({ runtimeErrors, totalErrorCount }) => {
            const isBuildError = runtimeErrors.length === 0
            return (
              <>
                <DevToolsIndicator
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
    </>
  )

  return (
    <DevOverlayErrorBoundary
      devOverlay={devOverlay}
      globalError={globalError}
      onError={setIsErrorOverlayOpen}
    >
      {children}
    </DevOverlayErrorBoundary>
  )
}
