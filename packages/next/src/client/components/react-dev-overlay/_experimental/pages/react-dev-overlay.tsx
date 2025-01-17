import * as React from 'react'

import { ShadowPortal } from '../internal/components/shadow-portal'
import { BuildError } from '../internal/container/build-error'
import { Errors } from '../internal/container/errors'
import { Base } from '../internal/styles/base'
import { ComponentStyles } from '../internal/styles/component-styles'
import { CssReset } from '../internal/styles/css-reset'

import { ErrorBoundary } from '../../pages/error-boundary'
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

  const isTurbopack = !!process.env.TURBOPACK

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
            isTurbopack={isTurbopack}
          />
        ) : hasRuntimeErrors ? (
          <Errors
            isAppDir={false}
            errors={state.errors}
            versionInfo={state.versionInfo}
            initialDisplayState={'fullscreen'}
            isTurbopack={isTurbopack}
          />
        ) : (
          <Errors
            isAppDir={false}
            errors={state.errors}
            versionInfo={state.versionInfo}
            initialDisplayState={'minimized'}
            isTurbopack={isTurbopack}
          />
        )}
      </ShadowPortal>
    </>
  )
}
