import * as React from 'react'

import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import { ErrorBoundary } from './ErrorBoundary'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'
import { usePagesReactDevOverlay } from './hooks'

export type ErrorType = 'runtime' | 'build'

export default function ReactDevOverlay({
  children,
}: {
  children?: React.ReactNode
}) {
  const {
    isMounted,
    hasBuildError,
    hasRuntimeErrors,
    state,
    onComponentError,
  } = usePagesReactDevOverlay()

  return (
    <>
      <ErrorBoundary isMounted={isMounted} onError={onComponentError}>
        {children ?? null}
      </ErrorBoundary>
      {isMounted ? (
        <ShadowPortal>
          <CssReset />
          <Base />
          <ComponentStyles />

          {hasBuildError ? (
            <BuildError
              message={state.buildError!}
              versionInfo={state.versionInfo}
            />
          ) : hasRuntimeErrors ? (
            <Errors
              isAppDir={false}
              errors={state.errors}
              versionInfo={state.versionInfo}
              initialDisplayState={'fullscreen'}
            />
          ) : undefined}
        </ShadowPortal>
      ) : undefined}
    </>
  )
}
