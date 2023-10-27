import React from 'react'

type ErrorBoundaryProps = {
  children?: React.ReactNode
  onError: (error: Error, componentStack: string | null) => void
  globalOverlay?: boolean
  isMounted?: boolean
}
type ErrorBoundaryState = { error: Error | null }

class ErrorBoundary extends React.PureComponent<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(
    error: Error,
    // Loosely typed because it depends on the React version and was
    // accidentally excluded in some versions.
    errorInfo?: { componentStack?: string | null }
  ) {
    this.props.onError(error, errorInfo?.componentStack || null)
    if (!this.props.globalOverlay) {
      this.setState({ error })
    }
  }

  render() {
    // The component has to be unmounted or else it would continue to error
    return this.state.error ||
      (this.props.globalOverlay && this.props.isMounted) ? (
      // When the overlay is global for the application and it wraps a component rendering `<html>`
      // we have to render the html shell otherwise the shadow root will not be able to attach
      this.props.globalOverlay ? (
        <html>
          <head></head>
          <body></body>
        </html>
      ) : null
    ) : (
      this.props.children
    )
  }
}

export { ErrorBoundary }
