import type { ErrorType } from '../types'
import { useCallback, useEffect } from 'react'
import { useErrorOverlayReducer } from '../shared'
import { on, off } from './bus'

const shouldPreventDisplay = (
  errorType?: ErrorType | null,
  preventType?: ErrorType[] | null
) => {
  if (!preventType || !errorType) {
    return false
  }
  return preventType.includes(errorType)
}

export const usePagesReactDevOverlay = (preventDisplay?: ErrorType[]) => {
  const [state, dispatch] = useErrorOverlayReducer()

  useEffect(() => {
    on(dispatch)
    return function () {
      off(dispatch)
    }
  }, [dispatch])

  const onComponentError = useCallback(
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
    errorType,
    state,
    onComponentError,
  }
}
