'use client'

import React from 'react'

const styles = {
  error: {
    // https://github.com/sindresorhus/modern-normalize/blob/main/modern-normalize.css#L38-L52
    fontFamily:
      'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
    height: '100vh',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: {
    textAlign: 'left',
  },
  text: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '3em',
    margin: 0,
  },
} as const

export type ErrorComponent = React.ComponentType<{
  error: Error
  reset: () => void
}>

export interface ErrorBoundaryProps {
  errorComponent: ErrorComponent
  errorStyles?: React.ReactNode | undefined
}

export class ErrorBoundaryHandler extends React.Component<
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
        <>
          {this.props.errorStyles}
          <this.props.errorComponent
            error={this.state.error}
            reset={this.reset}
          />
        </>
      )
    }

    return this.props.children
  }
}

export default function GlobalError({ error }: { error: any }) {
  return (
    <html>
      <head></head>
      <body>
        <div style={styles.error}>
          <div style={styles.desc}>
            <h2 style={styles.text}>
              Application error: a client-side exception has occurred (see the
              browser console for more information).
            </h2>
            {error?.digest && (
              <p style={styles.text}>{`Digest: ${error.digest}`}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}

/**
 * Handles errors through `getDerivedStateFromError`.
 * Renders the provided error component and provides a way to `reset` the error boundary state.
 */

/**
 * Renders error boundary with the provided "errorComponent" property as the fallback.
 * If no "errorComponent" property is provided it renders the children without an error boundary.
 */
export function ErrorBoundary({
  errorComponent,
  errorStyles,
  children,
}: ErrorBoundaryProps & { children: React.ReactNode }): JSX.Element {
  if (errorComponent) {
    return (
      <ErrorBoundaryHandler
        errorComponent={errorComponent}
        errorStyles={errorStyles}
      >
        {children}
      </ErrorBoundaryHandler>
    )
  }

  return <>{children}</>
}
