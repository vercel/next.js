import React from 'react'

type ErrorBoundaryProps = {
  onError: (error: Error, componentStack: string | null) => void
  fallback: React.ReactNode | null
  children?: React.ReactNode
}

type ErrorBoundaryState = { error: Error | null }

class ErrorBoundary extends React.PureComponent<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  state = { error: null }

  componentDidCatch(
    error: Error,
    // Loosely typed because it depends on the React version and was
    // accidentally excluded in some versions.
    errorInfo?: { componentStack?: string | null }
  ) {
    this.props.onError(error, errorInfo?.componentStack ?? null)
  }

  render() {
    const { error } = this.state

    const { fallback } = this.props

    // The component has to be unmounted or else it would continue to error
    if (error != null) {
      return fallback
    }

    return this.props.children
  }
}

export { ErrorBoundary }
