import React, { PureComponent, startTransition } from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import { RuntimeErrorHandler } from '../../../client/dev/runtime-error-handler'
import { ErrorBoundary } from '../../../client/components/error-boundary'
import DefaultGlobalError from '../../../client/components/builtin/global-error'
import type { GlobalErrorState } from '../../../client/components/app-router-instance'
import { SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE } from './segment-explorer-node'
import {
  AppRouterContext,
  type AppRouterInstance,
} from '../../../shared/lib/app-router-context.shared-runtime'

type AppDevOverlayErrorBoundaryProps = {
  children: React.ReactNode
  globalError: GlobalErrorState
}

type AppDevOverlayErrorBoundaryState = {
  reactError: unknown
  componentStack: React.ErrorInfo['componentStack']
  /** Only available in dev builds; `null` otherwise. */
  ownerStack: ReturnType<typeof React.captureOwnerStack>
}

function ErroredHtml({
  globalError: [GlobalError, globalErrorStyles],
  error,
  reset,
  unstable_retry,
  componentStack,
  ownerStack,
}: {
  globalError: GlobalErrorState
  error: unknown
  reset: () => void
  unstable_retry: () => void
  componentStack: React.ErrorInfo['componentStack']
  ownerStack: ReturnType<typeof React.captureOwnerStack>
}) {
  if (!error) {
    return (
      <html>
        <head />
        <body />
      </html>
    )
  }
  return (
    <ErrorBoundary errorComponent={DefaultGlobalError}>
      {globalErrorStyles}
      <GlobalError
        error={error}
        reset={reset}
        unstable_retry={unstable_retry}
        componentStack={componentStack}
        ownerStack={ownerStack}
      />
    </ErrorBoundary>
  )
}

export class AppDevOverlayErrorBoundary extends PureComponent<
  AppDevOverlayErrorBoundaryProps,
  AppDevOverlayErrorBoundaryState
> {
  static contextType = AppRouterContext
  declare context: AppRouterInstance | null

  state: AppDevOverlayErrorBoundaryState = {
    reactError: null,
    componentStack: undefined,
    ownerStack: null,
  }

  static getDerivedStateFromError(error: Error) {
    RuntimeErrorHandler.hadRuntimeError = true

    let ownerStack: string | null = null
    if ('captureOwnerStack' in React) {
      ownerStack = React.captureOwnerStack()
    }

    return {
      reactError: error,
      ownerStack,
    }
  }

  componentDidCatch(err: Error, errorInfo: React.ErrorInfo) {
    if (
      process.env.NODE_ENV === 'development' &&
      err.message === SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE
    ) {
      return
    }
    this.setState({
      componentStack: errorInfo.componentStack,
    })
    dispatcher.openErrorOverlay()
  }

  unstable_retry = () => {
    startTransition(() => {
      this.context?.refresh()
      this.reset()
    })
  }

  reset = () => {
    this.setState({
      reactError: null,
      componentStack: undefined,
      ownerStack: null,
    })
  }

  render() {
    const { children, globalError } = this.props
    const { reactError, componentStack, ownerStack } = this.state

    const fallback = (
      <ErroredHtml
        globalError={globalError}
        error={reactError}
        reset={this.reset}
        unstable_retry={this.unstable_retry}
        componentStack={componentStack}
        ownerStack={ownerStack}
      />
    )

    return reactError !== null ? fallback : children
  }
}
