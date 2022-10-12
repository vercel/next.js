import React from 'react'

type ErrorBoundaryProps = {
  hasRuntimeErrors: boolean
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
    if (this.state.error || this.props.hasRuntimeErrors) {
      return (
        <html>
          <head></head>
          <body></body>
        </html>
      )
    }

    // When there is a build error the underlying components can be kept rendered.
    return this.props.children
  }
}

export { ErrorBoundary }
