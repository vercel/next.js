import * as React from 'react'

import { useState } from 'react'
import { ShadowPortal } from '../_internal/components/shadow-portal'
import { Base } from '../_internal/styles/base'
import { ComponentStyles } from '../_internal/styles/component-styles'
import { CssReset } from '../_internal/styles/css-reset'

import { DevOverlayErrorBoundary } from './error-boundary'
import { usePagesReactDevOverlay } from './hooks'
import { Colors } from '../_internal/styles/colors'
import { ErrorOverlay } from '../_internal/components/errors/error-overlay/error-overlay'
import { DevToolsIndicator } from '../_internal/components/errors/dev-tools-indicator/dev-tools-indicator'
import { RenderError } from '../_internal/container/runtime-error/render-error'
import { FontStyles } from '../_internal/font/font-styles'

export type ErrorType = 'runtime' | 'build'

export type ReactDevOverlayType = typeof ReactDevOverlay

interface ReactDevOverlayProps {
  children?: React.ReactNode
}

export default function ReactDevOverlay({ children }: ReactDevOverlayProps) {
  const { state, onComponentError, hasRuntimeErrors, hasBuildError } =
    usePagesReactDevOverlay()

  const [isErrorOverlayOpen, setIsErrorOverlayOpen] = useState(true)

  return (
    <>
      <DevOverlayErrorBoundary onError={onComponentError}>
        {children ?? null}
      </DevOverlayErrorBoundary>

      {/* Fonts can only be loaded outside the Shadow DOM. */}
      <FontStyles />
      <ShadowPortal>
        <CssReset />
        <Base />
        <Colors />
        <ComponentStyles />

        <RenderError state={state} isAppDir={false}>
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

                {(hasRuntimeErrors || hasBuildError) && (
                  <ErrorOverlay
                    state={state}
                    runtimeErrors={runtimeErrors}
                    isErrorOverlayOpen={isErrorOverlayOpen}
                    setIsErrorOverlayOpen={setIsErrorOverlayOpen}
                  />
                )}
              </>
            )
          }}
        </RenderError>
      </ShadowPortal>
    </>
  )
}
