'use client'

import React, { type JSX } from 'react'
import { useUntrackedPathname } from './navigation-untracked'
import { isNextRouterError } from './is-next-router-error'
import { handleHardNavError } from './nav-failure-handler'
import { workAsyncStorage } from '../../server/app-render/work-async-storage.external'

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
  text: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '28px',
    margin: '0 8px',
  },
} as const

export type ErrorComponent = React.ComponentType<{
  error: Error
  reset: () => void
}>

export interface ErrorBoundaryProps {
  children?: React.ReactNode
  errorComponent: ErrorComponent | undefined
  errorStyles?: React.ReactNode | undefined
  errorScripts?: React.ReactNode | undefined
}

interface ErrorBoundaryHandlerProps extends ErrorBoundaryProps {
  pathname: string | null
  errorComponent: ErrorComponent
}

interface ErrorBoundaryHandlerState {
  error: Error | null
  previousPathname: string | null
}

// if we are revalidating we want to re-throw the error so the
// function crashes so we can maintain our previous cache
// instead of caching the error page
function HandleISRError({ error }: { error: any }) {
  const store = workAsyncStorage.getStore()
  if (store?.isRevalidate || store?.isStaticGeneration) {
    console.error(error)
    throw error
  }

  return null
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
    if (isNextRouterError(error)) {
      // Re-throw if an expected internal Next.js router error occurs
      // this means it should be handled by a different boundary (such as a NotFound boundary in a parent segment)
      throw error
    }

    return { error }
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryHandlerProps,
    state: ErrorBoundaryHandlerState
  ): ErrorBoundaryHandlerState | null {
    const { error } = state

    // if we encounter an error while
    // a navigation is pending we shouldn't render
    // the error boundary and instead should fallback
    // to a hard navigation to attempt recovering
    if (process.env.__NEXT_APP_NAV_FAIL_HANDLING) {
      if (error && handleHardNavError(error)) {
        // clear error so we don't render anything
        return {
          error: null,
          previousPathname: props.pathname,
        }
      }
    }

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

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <>
          <HandleISRError error={this.state.error} />
          {this.props.errorStyles}
          {this.props.errorScripts}
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

export type GlobalErrorComponent = React.ComponentType<{
  error: any
}>
export function GlobalError({ error }: { error: any }) {
  const digest: string | undefined = error?.digest
  return (
    <html id="__next_error__">
      <head></head>
      <body>
        <HandleISRError error={error} />
        <div style={styles.error}>
          <div>
            <h2 style={styles.text}>
              Application error: a {digest ? 'server' : 'client'}-side exception
              has occurred while loading {window.location.hostname} (see the{' '}
              {digest ? 'server logs' : 'browser console'} for more
              information).
            </h2>
            {digest ? <p style={styles.text}>{`Digest: ${digest}`}</p> : null}
          </div>
        </div>
      </body>
    </html>
  )
}

// Exported so that the import signature in the loaders can be identical to user
// supplied custom global error signatures.
export default GlobalError

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
  errorScripts,
  children,
}: ErrorBoundaryProps & {
  children: React.ReactNode
}): JSX.Element {
  // When we're rendering the missing params shell, this will return null. This
  // is because we won't be rendering any not found boundaries or error
  // boundaries for the missing params shell. When this runs on the client
  // (where these errors can occur), we will get the correct pathname.
  const pathname = useUntrackedPathname()
  if (errorComponent) {
    return (
      <ErrorBoundaryHandler
        pathname={pathname}
        errorComponent={errorComponent}
        errorStyles={errorStyles}
        errorScripts={errorScripts}
      >
        {children}
      </ErrorBoundaryHandler>
    )
  }

  return <>{children}</>
}
