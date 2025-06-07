import { PureComponent } from 'react'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import { RuntimeErrorHandler } from '../runtime-error-handler'
import { ErrorBoundary } from '../../error-boundary'
import DefaultGlobalError, {
  type GlobalErrorComponent,
} from '../../global-error'

type AppDevOverlayErrorBoundaryProps = {
  children: React.ReactNode
  globalError: [GlobalErrorComponent, React.ReactNode]
}

type AppDevOverlayErrorBoundaryState = {
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
  state = { reactError: null }

  static getDerivedStateFromError(error: Error) {
    RuntimeErrorHandler.hadRuntimeError = true

    return {
      reactError: error,
    }
  }

  componentDidCatch() {
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
