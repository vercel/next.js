import React from 'react'
import * as Bus from './bus'
import { useErrorOverlayReducer } from '../shared'

export const usePagesReactDevOverlay = () => {
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

  return {
    hasBuildError,
    hasRuntimeErrors,
    state,
    onComponentError,
  }
}
