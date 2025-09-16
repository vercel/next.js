import { PureComponent } from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import { RuntimeErrorHandler } from '../../../client/dev/runtime-error-handler'
import { ErrorBoundary } from '../../../client/components/error-boundary'
import DefaultGlobalError from '../../../client/components/builtin/global-error'
import type { GlobalErrorState } from '../../../client/components/app-router-instance'
import { SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE } from './segment-explorer-node'

type AppDevOverlayErrorBoundaryProps = {
  children: React.ReactNode
  globalError: GlobalErrorState
}

type AppDevOverlayErrorBoundaryState = {
  reactError: unknown
}

function ErroredHtml({
  globalError: [GlobalError, globalErrorStyles],
  error,
}: {
  globalError: GlobalErrorState
  error: unknown
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
      <GlobalError error={error} />
    </ErrorBoundary>
  )
}

export class AppDevOverlayErrorBoundary extends PureComponent<
  AppDevOverlayErrorBoundaryProps,
  AppDevOverlayErrorBoundaryState
> {
  state = { reactError: null }

  static getDerivedStateFromError(error: Error) {
    RuntimeErrorHandler.hadRuntimeError = true

    return {
      reactError: error,
    }
  }

  componentDidCatch(err: Error) {
    if (
      process.env.NODE_ENV === 'development' &&
      err.message === SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE
    ) {
      return
    }
    dispatcher.openErrorOverlay()
  }

  render() {
    const { children, globalError } = this.props
    const { reactError } = this.state

    const fallback = (
      <ErroredHtml globalError={globalError} error={reactError} />
    )

    return reactError !== null ? fallback : children
  }
}
