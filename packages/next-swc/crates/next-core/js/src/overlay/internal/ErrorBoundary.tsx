import React from 'react'

type ErrorBoundaryProps = {
  error: Error | null
  onError: (error: Error, componentStack: string | null) => void
  fallback: React.ReactNode | null
  children?: React.ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
  lastPropsError: Error | null
}

class ErrorBoundary extends React.PureComponent<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  state = {
    error: null,
    lastPropsError: null,
  }

  componentDidCatch(
    error: Error,
    // Loosely typed because it depends on the React version and was
    // accidentally excluded in some versions.
    errorInfo?: { componentStack?: string | null }
  ) {
    this.props.onError(error, errorInfo?.componentStack ?? null)
  }

  // I don't like this, but it works to clear the error boundary
  //
  // props.error is only set 1 render after state.error, so we can't treat it as the source of truth all the time.
  // to get around this we store the error from props in state and only accept updates if the stored error from props
  // matches the error in state.
  //
  // this is definitely not a controlled component and it only works if the error matches exactly
  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState
  ): ErrorBoundaryState | null {
    if (state.lastPropsError === props.error) {
      return null
    }

    let error = state.error

    if (state.error === state.lastPropsError) {
      error = props.error
    }

    return {
      error,
      lastPropsError: props.error,
    }
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
