import * as React from 'react'

import * as Bus from './bus'
import { ShadowPortal } from '../internal/components/ShadowPortal'
import { BuildError } from '../internal/container/BuildError'
import { Errors } from '../internal/container/Errors'
import { ErrorBoundary } from './ErrorBoundary'
import { Base } from '../internal/styles/Base'
import { ComponentStyles } from '../internal/styles/ComponentStyles'
import { CssReset } from '../internal/styles/CssReset'
import { useErrorOverlayReducer } from '../shared'

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
  const [state, dispatch] = useErrorOverlayReducer()

  React.useEffect(() => {
    Bus.on(dispatch)
    return function () {
      Bus.off(dispatch)
    }
  }, [dispatch])

  const onComponentError = React.useCallback(
    (_error: Error, _componentStack: string | null) => {
      // TODO: special handling
    },
    []
  )

  const hasBuildError = state.buildError != null
  const hasRuntimeErrors = Boolean(state.errors.length)
  const errorType = hasBuildError
    ? 'build'
    : hasRuntimeErrors
      ? 'runtime'
      : null
  const isMounted = errorType !== null

  const displayPrevented = shouldPreventDisplay(errorType, preventDisplay)

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
