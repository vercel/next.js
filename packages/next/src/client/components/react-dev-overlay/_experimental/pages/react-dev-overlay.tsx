import * as React from 'react'

import { useState } from 'react'
import { ShadowPortal } from '../internal/components/shadow-portal'
import { Base } from '../internal/styles/base'
import { ComponentStyles } from '../internal/styles/component-styles'
import { CssReset } from '../internal/styles/css-reset'

import { DevOverlayErrorBoundary } from './error-boundary'
import { usePagesReactDevOverlay } from '../../pages/hooks'
import { Colors } from '../internal/styles/colors'
import { ErrorOverlay } from '../internal/components/errors/error-overlay/error-overlay'
import { DevToolsIndicator } from '../internal/components/errors/dev-tools-indicator/dev-tools-indicator'
import { useErrorHook } from '../internal/container/runtime-error/use-error-hook'

export type ErrorType = 'runtime' | 'build'

interface ReactDevOverlayProps {
  children?: React.ReactNode
}

export default function ReactDevOverlay({ children }: ReactDevOverlayProps) {
  const { state, onComponentError, hasRuntimeErrors, hasBuildError } =
    usePagesReactDevOverlay()

  const { readyErrors, totalErrorCount } = useErrorHook({
    state,
    isAppDir: false,
  })

  const [isErrorOverlayOpen, setIsErrorOverlayOpen] = useState(true)

  return (
    <>
      <DevOverlayErrorBoundary onError={onComponentError}>
        {children ?? null}
      </DevOverlayErrorBoundary>

      <ShadowPortal>
        <CssReset />
        <Base />
        <Colors />
        <ComponentStyles />

        <DevToolsIndicator
          state={state}
          errorCount={totalErrorCount}
          setIsErrorOverlayOpen={setIsErrorOverlayOpen}
        />

        {(hasRuntimeErrors || hasBuildError) && (
          <ErrorOverlay
            state={state}
            readyErrors={readyErrors}
            isErrorOverlayOpen={isErrorOverlayOpen}
            setIsErrorOverlayOpen={setIsErrorOverlayOpen}
          />
        )}
      </ShadowPortal>
    </>
  )
}
