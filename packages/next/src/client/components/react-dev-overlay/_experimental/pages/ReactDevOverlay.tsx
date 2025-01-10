import * as React from 'react'

import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'

import { ErrorBoundary } from '../../pages/ErrorBoundary'
import { usePagesReactDevOverlay } from '../../pages/hooks'
import { Colors } from '../internal/styles/colors'

export type ErrorType = 'runtime' | 'build'

interface ReactDevOverlayProps {
  children?: React.ReactNode
}

export default function ReactDevOverlay({ children }: ReactDevOverlayProps) {
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
      <ShadowPortal>
        <CssReset />
        <Base />
        <Colors />
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
            isTurbopackEnabled={!!process.env.TURBOPACK}
          />
        ) : (
          <Errors
            isAppDir={false}
            errors={state.errors}
            versionInfo={state.versionInfo}
            initialDisplayState={'minimized'}
            isTurbopackEnabled={!!process.env.TURBOPACK}
          />
        )}
      </ShadowPortal>
    </>
  )
}
