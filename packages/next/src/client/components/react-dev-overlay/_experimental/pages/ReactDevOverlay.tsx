import * as React from 'react'

import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'

import { ErrorBoundary } from '../../pages/ErrorBoundary'
import { usePagesReactDevOverlay } from '../../pages/hooks'

export type ErrorType = 'runtime' | 'build'

interface ReactDevOverlayProps {
  children?: React.ReactNode
  preventDisplay?: ErrorType[]
  globalOverlay?: boolean
}

export default function ReactDevOverlay({
  children,
  preventDisplay,
  globalOverlay,
}: ReactDevOverlayProps) {
  const {
    isMounted,
    displayPrevented,
    hasBuildError,
    hasRuntimeErrors,
    state,
    onComponentError,
  } = usePagesReactDevOverlay(preventDisplay)

  return (
    <>
      <ErrorBoundary
        globalOverlay={globalOverlay}
        isMounted={isMounted}
        onError={onComponentError}
      >
        {children ?? null}
      </ErrorBoundary>
      {isMounted ? (
        <ShadowPortal>
          <CssReset />
          <Base />
          <ComponentStyles />

          {displayPrevented ? null : hasBuildError ? (
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
