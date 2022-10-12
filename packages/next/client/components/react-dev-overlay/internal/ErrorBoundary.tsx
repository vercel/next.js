import React from 'react'

type ErrorBoundaryProps = {
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

  render() {
    // The component has to be unmounted or else it would continue to error
    return this.state.error || this.props.isMounted ? (
      // When the overlay is global for the application and it wraps a component rendering `<html>`
      // we have to render the html shell otherwise the shadow root will not be able to attach
      <html>
        <head></head>
        <body></body>
      </html>
    ) : (
      this.props.children
    )
  }
}

export { ErrorBoundary }
