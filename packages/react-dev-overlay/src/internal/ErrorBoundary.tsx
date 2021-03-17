import React from 'react'

type ErrorBoundaryProps = {
  onError: (error: Error, componentStack: string | null) => void
}
type ErrorBoundaryState = { error: Error | null }

class ErrorBoundary extends React.PureComponent<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state = { error: null }

  componentDidCatch(
    error: Error,
    // Loosely typed because it depends on the React version and was
    // accidentally excluded in some versions.
    errorInfo?: { componentStack?: string | null }
  ) {
    this.props.onError(error, errorInfo?.componentStack || null)
    this.setState({ error })
  }

  render() {
    return this.state.error
      ? // The component has to be unmounted or else it would continue to error
        null
      : this.props.children
  }
}

export { ErrorBoundary }
