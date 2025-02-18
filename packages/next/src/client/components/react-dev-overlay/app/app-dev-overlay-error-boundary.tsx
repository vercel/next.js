import { PureComponent } from 'react'
import { RuntimeErrorHandler } from '../../errors/runtime-error-handler'
import {
  ErrorBoundary,
  type GlobalErrorComponent,
  GlobalError as DefaultGlobalError,
} from '../../error-boundary'
import { onUncaughtError } from '../../../react-client-callbacks/error-boundary-callbacks'

type AppDevOverlayErrorBoundaryProps = {
  children: React.ReactNode
  globalError: [GlobalErrorComponent, React.ReactNode]
  onError: (value: boolean) => void
}

type AppDevOverlayErrorBoundaryState = {
  isReactError: boolean
  reactError: unknown
}

function ErroredHtml({
  globalError: [GlobalError, globalErrorStyles],
  error,
}: {
  globalError: [GlobalErrorComponent, React.ReactNode]
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
  state = { isReactError: false, reactError: null }

  static getDerivedStateFromError(error: Error) {
    if (!error.stack) {
      return { isReactError: false, reactError: null }
    }

    RuntimeErrorHandler.hadRuntimeError = true

    return {
      isReactError: true,
      reactError: error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError(this.state.isReactError)

    // We don't consider errors caught unless they're caught by an explicit error
    // boundary. The built-in ones are considered implicit.
    onUncaughtError(error, errorInfo)
  }

  render() {
    const { children, globalError } = this.props
    const { isReactError, reactError } = this.state

    const fallback = (
      <ErroredHtml globalError={globalError} error={reactError} />
    )

    return isReactError ? fallback : children
  }
}
