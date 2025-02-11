import * as React from 'react'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // TODO: figure out how to better handle errors thrown inside the dev overlay itself
    // this is a temporary solution to prevent the dev overlay from causing an
    // infinite loop of errors
    console.error(
      'This is a bug in Next.js: failed to render dev overlay',
      error
    )
  }

  render() {
    // Return null if there was an error to prevent infinite loops
    return this.state.error ? null : this.props.children
  }
}

export function withSwallowError<P extends object>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return function WithSwallowError(props: P): React.ReactElement {
    return (
      <ErrorBoundary>
        <Component {...props} />
      </ErrorBoundary>
    )
  }
}
