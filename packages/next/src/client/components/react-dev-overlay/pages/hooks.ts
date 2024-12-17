import type { ErrorType } from './ReactDevOverlay'
import React from 'react'
import * as Bus from './bus'
import { useErrorOverlayReducer } from '../shared'

const shouldPreventDisplay = (
  errorType?: ErrorType | null,
  preventType?: ErrorType[] | null
) => {
  if (!preventType || !errorType) {
    return false
  }
  return preventType.includes(errorType)
}

export const usePagesReactDevOverlay = (
  preventDisplay: ErrorType[] | undefined
) => {
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
  return {
    isMounted,
    displayPrevented,
    hasBuildError,
    hasRuntimeErrors,
    state,
    onComponentError,
  }
}
