import * as React from 'react'
import type { OverlayState } from './error-overlay-reducer'

import { ShadowPortal } from './components/ShadowPortal'
import { BuildError } from './container/BuildError'
import { Errors } from './container/Errors'
import { ErrorBoundary } from './ErrorBoundary'
import { Base } from './styles/Base'
import { ComponentStyles } from './styles/ComponentStyles'
import { CssReset } from './styles/CssReset'

type ErrorType = 'runtime' | 'build'

const shouldPreventDisplay = (
  errorType?: ErrorType | null,
  preventType?: ErrorType[] | null
) => {
  if (!preventType || !errorType) {
    return false
  }
  return preventType.includes(errorType)
}

function ReactDevOverlay({
  state,
  children,
  preventDisplay,
}: {
  state: OverlayState
  children?: React.ReactNode
  preventDisplay?: ErrorType[]
}) {
  const hasBuildError = state.buildError != null
  const hasRuntimeErrors = Boolean(state.errors.length)

  const isMounted = hasBuildError || hasRuntimeErrors

  return (
    <>
      <ErrorBoundary isMounted={isMounted}>{children}</ErrorBoundary>
      {isMounted ? (
        <ShadowPortal>
          <CssReset />
          <Base />
          <ComponentStyles />

          {shouldPreventDisplay(
            hasBuildError ? 'build' : hasRuntimeErrors ? 'runtime' : null,
            preventDisplay
          ) ? null : hasBuildError ? (
            <BuildError message={state.buildError!} />
          ) : hasRuntimeErrors ? (
            <Errors errors={state.errors} />
          ) : undefined}
        </ShadowPortal>
      ) : undefined}
    </>
  )
}

export default ReactDevOverlay
