import type { GlobalErrorComponent } from '../../../error-boundary'

import { PureComponent } from 'react'
import { RuntimeErrorHandler } from '../../../errors/runtime-error-handler'

type DevToolsErrorBoundaryProps = {
  children: React.ReactNode
  onError: (value: boolean) => void
  globalError: [GlobalErrorComponent, React.ReactNode]
}

type DevToolsErrorBoundaryState = {
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
    <>
      {globalErrorStyles}
      <GlobalError error={error} />
    </>
  )
}

export class DevToolsErrorBoundary extends PureComponent<
  DevToolsErrorBoundaryProps,
  DevToolsErrorBoundaryState
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

  componentDidCatch() {
    this.props.onError(this.state.isReactError)
  }

  render() {
    const fallback = (
      <ErroredHtml
        globalError={this.props.globalError}
        error={this.state.reactError}
      />
    )

    return this.state.isReactError ? fallback : this.props.children
  }
}
