'use client'

import React from 'react'
import { usePathname } from './navigation'

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
  children?: React.ReactNode
  errorComponent: ErrorComponent
  errorStyles?: React.ReactNode | undefined
}

interface ErrorBoundaryHandlerProps extends ErrorBoundaryProps {
  pathname: string
}

interface ErrorBoundaryHandlerState {
  error: Error | null
  previousPathname: string
}

export class ErrorBoundaryHandler extends React.Component<
  ErrorBoundaryHandlerProps,
  ErrorBoundaryHandlerState
> {
  constructor(props: ErrorBoundaryHandlerProps) {
    super(props)
    this.state = { error: null, previousPathname: this.props.pathname }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryHandlerProps,
    state: ErrorBoundaryHandlerState
  ): ErrorBoundaryHandlerState | null {
    /**
     * Handles reset of the error boundary when a navigation happens.
     * Ensures the error boundary does not stay enabled when navigating to a new page.
     * Approach of setState in render is safe as it checks the previous pathname and then overrides
     * it as outlined in https://react.dev/reference/react/useState#storing-information-from-previous-renders
     */
    if (props.pathname !== state.previousPathname && state.error) {
      return {
        error: null,
        previousPathname: props.pathname,
      }
    }
    return {
      error: state.error,
      previousPathname: props.pathname,
    }
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
  const pathname = usePathname()
  if (errorComponent) {
    return (
      <ErrorBoundaryHandler
        pathname={pathname}
        errorComponent={errorComponent}
        errorStyles={errorStyles}
      >
        {children}
      </ErrorBoundaryHandler>
    )
  }

  return <>{children}</>
}
