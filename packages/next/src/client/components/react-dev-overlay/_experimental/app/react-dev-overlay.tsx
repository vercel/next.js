import type { OverlayState } from '../../shared'
import type { GlobalErrorComponent } from '../../../error-boundary'

import { useState } from 'react'
import { DevToolsErrorBoundary } from './error-boundary'
import { ShadowPortal } from '../internal/components/shadow-portal'
import { Base } from '../internal/styles/base'
import { ComponentStyles } from '../internal/styles/component-styles'
import { CssReset } from '../internal/styles/css-reset'
import { Colors } from '../internal/styles/colors'
import { ErrorOverlay } from '../internal/components/errors/error-overlay/error-overlay'
import { DevToolsIndicator } from '../internal/components/errors/dev-tools-indicator/dev-tools-indicator'
import { useErrorHook } from '../internal/container/runtime-error/use-error-hook'

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
  const { readyErrors } = useErrorHook({ errors: state.errors, isAppDir: true })

  return (
    <>
      <DevToolsErrorBoundary
        onError={setIsErrorOverlayOpen}
        globalError={globalError}
      >
        {children}
      </DevToolsErrorBoundary>

      <ShadowPortal>
        <CssReset />
        <Base />
        <Colors />
        <ComponentStyles />

        <DevToolsIndicator
          state={state}
          readyErrorsLength={readyErrors.length}
          setIsErrorOverlayOpen={setIsErrorOverlayOpen}
        />

        <ErrorOverlay
          state={state}
          readyErrors={readyErrors}
          isErrorOverlayOpen={isErrorOverlayOpen}
          setIsErrorOverlayOpen={setIsErrorOverlayOpen}
        />
      </ShadowPortal>
    </>
  )
}
