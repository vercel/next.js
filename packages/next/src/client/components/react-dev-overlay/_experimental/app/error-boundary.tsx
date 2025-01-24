import type { GlobalErrorComponent } from '../../../error-boundary'

import { PureComponent } from 'react'
import { RuntimeErrorHandler } from '../../../errors/runtime-error-handler'

type DevOverlayErrorBoundaryProps = {
  children: React.ReactNode
  devOverlay: React.ReactNode
  globalError: [GlobalErrorComponent, React.ReactNode]
  onError: (value: boolean) => void
}

type DevOverlayErrorBoundaryState = {
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

export class DevOverlayErrorBoundary extends PureComponent<
  DevOverlayErrorBoundaryProps,
  DevOverlayErrorBoundaryState
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
    const { children, globalError, devOverlay } = this.props
    const { isReactError, reactError } = this.state

    const fallback = (
      <ErroredHtml globalError={globalError} error={reactError} />
    )

    return (
      <>
        {isReactError ? fallback : children}
        {devOverlay}
      </>
    )
  }
}
