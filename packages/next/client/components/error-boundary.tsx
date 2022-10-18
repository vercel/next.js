import React from 'react'

export type ErrorComponent = React.ComponentType<{
  error: Error
  reset: () => void
}>
interface ErrorBoundaryProps {
  errorComponent: ErrorComponent
}

/**
 * Handles errors through `getDerivedStateFromError`.
 * Renders the provided error component and provides a way to `reset` the error boundary state.
 */
class ErrorBoundaryHandler extends React.Component<
  ErrorBoundaryProps,
  { error: Error | null }
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <this.props.errorComponent
          error={this.state.error}
          reset={this.reset}
        />
      )
    }

    return this.props.children
  }
}

/**
 * Renders error boundary with the provided "errorComponent" property as the fallback.
 * If no "errorComponent" property is provided it renders the children without an error boundary.
 */
export function ErrorBoundary({
  errorComponent,
  children,
}: ErrorBoundaryProps & { children: React.ReactNode }): JSX.Element {
  if (errorComponent) {
    return (
      <ErrorBoundaryHandler errorComponent={errorComponent}>
        {children}
      </ErrorBoundaryHandler>
    )
  }

  return <>{children}</>
}

const styles: { [k: string]: React.CSSProperties } = {
  error: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
    height: '100vh',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },

  desc: {
    display: 'inline-block',
    textAlign: 'left',
    lineHeight: '49px',
    height: '49px',
    verticalAlign: 'middle',
  },
  h2: {
    fontSize: '14px',
    fontWeight: 'normal',
    lineHeight: '49px',
    margin: 0,
    padding: 0,
  },
}

export function GlobalErrorComponent() {
  return (
    <html>
      <body>
        <div style={styles.error}>
          <div style={styles.desc}>
            <h2 style={styles.h2}>
              Application error: a client-side exception has occurred (see the
              browser console for more information).
            </h2>
          </div>
        </div>
      </body>
    </html>
  )
}
