'use client'

import React from 'react'
import { ErrorBoundary, type ErrorInfo } from './error-boundary'
import { RouterContext as PagesRouterContext } from '../../shared/lib/router-context.shared-runtime'

export function unstable_catchError<P extends Record<string, any>>(
  fallback: (props: P, errorInfo: ErrorInfo) => React.ReactNode
) {
  function NextErrorBoundary(props: P & { children?: React.ReactNode }) {
    const isPagesRouter = React.useContext(PagesRouterContext) !== null
    const { children, ...fallbackProps } = props

    // This is a hook instead of a component to avoid lint error about nested components.
    function useFallback(errorInfo: ErrorInfo) {
      const unstable_retry: ErrorInfo['unstable_retry'] = () => {
        if (isPagesRouter) {
          throw new Error(
            '`unstable_retry()` can only be used in the App Router. Use `reset()` in the Pages Router.'
          )
        }
        errorInfo.unstable_retry()
      }

      return fallback(fallbackProps as P, {
        ...errorInfo,
        unstable_retry,
      })
    }

    useFallback.displayName = fallback.name

    return (
      <ErrorBoundary errorComponent={useFallback}>{children}</ErrorBoundary>
    )
  }

  if (process.env.NODE_ENV !== 'production') {
    // `unstable_catchError()` is parsed as an HOC-style name and displays as
    // a label (<name> [unstable_catchError]) in DevTools.
    NextErrorBoundary.displayName = 'unstable_catchError(NextErrorBoundary)'
  }

  return NextErrorBoundary
}
