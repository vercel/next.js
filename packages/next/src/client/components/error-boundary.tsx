'use client'

import React, { type JSX } from 'react'
import { useUntrackedPathname } from './navigation-untracked'
import { isNextRouterError } from './is-next-router-error'
import { handleHardNavError } from './nav-failure-handler'
import { HandleISRError } from './handle-isr-error'
import { isBot } from '../../shared/lib/router/utils/is-bot'
import {
  isChunkOrNetworkError,
  ChunkLoadErrorBanner,
  type ChunkErrorAction,
} from './chunk-load-error'

const isBotUserAgent =
  typeof window !== 'undefined' && isBot(window.navigator.userAgent)

export type ErrorComponent = React.ComponentType<{
  error: Error
  // global-error, there's no `reset` function;
  // regular error boundary, there's a `reset` function.
  reset?: () => void
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
  chunkErrorAction: ChunkErrorAction | null
  frozenHTML: string | null
}

export class ErrorBoundaryHandler extends React.Component<
  ErrorBoundaryHandlerProps,
  ErrorBoundaryHandlerState
> {
  constructor(props: ErrorBoundaryHandlerProps) {
    super(props)
    this.state = {
      error: null,
      previousPathname: this.props.pathname,
      chunkErrorAction: null,
      frozenHTML: null,
    }
  }

  static getDerivedStateFromError(error: Error) {
    if (isNextRouterError(error)) {
      // Re-throw if an expected internal Next.js router error occurs
      // this means it should be handled by a different boundary (such as a NotFound boundary in a parent segment)
      throw error
    }

    // Check if this is a chunk load or network error
    if (isChunkOrNetworkError(error)) {
      // Capture the current body content before React re-renders with error UI.
      // getDerivedStateFromError runs during the render phase, so the DOM still
      // has the original content at this point.
      let frozenHTML: string | null = null
      if (typeof document !== 'undefined') {
        frozenHTML = document.body.innerHTML
      }

      return {
        error,
        chunkErrorAction: 'banner' as ChunkErrorAction,
        frozenHTML,
      }
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
          chunkErrorAction: null,
          frozenHTML: null,
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
        chunkErrorAction: null,
        frozenHTML: null,
      }
    }
    return {
      error: state.error,
      previousPathname: props.pathname,
      chunkErrorAction: state.chunkErrorAction,
      frozenHTML: state.frozenHTML,
    }
  }

  reset = () => {
    this.setState({
      error: null,
      chunkErrorAction: null,
      frozenHTML: null,
    })
  }

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
    const { error, chunkErrorAction } = this.state

    // When it's bot request, segment level error boundary will keep rendering the children,
    // the final error will be caught by the root error boundary and determine wether need to apply graceful degrade.
    if (error && !isBotUserAgent) {
      // Show banner for chunk load errors
      if (chunkErrorAction === 'banner') {
        // For chunk errors, we preserve the page content captured from document.body
        // in getDerivedStateFromError (before React commits error UI).
        // Banner renders first (sticky top) and pushes frozen content down.
        const { frozenHTML } = this.state
        return (
          <>
            <HandleISRError error={error} />
            <ChunkLoadErrorBanner
              pathname={this.props.pathname || '/'}
              error={error}
            />
            {frozenHTML && (
              <div
                style={{ pointerEvents: 'none' }}
                suppressHydrationWarning
                dangerouslySetInnerHTML={{ __html: frozenHTML }}
              />
            )}
          </>
        )
      }

      // Full-page error for non-chunk errors
      return (
        <>
          <HandleISRError error={error} />
          {this.props.errorStyles}
          {this.props.errorScripts}
          <this.props.errorComponent error={error} reset={this.reset} />
        </>
      )
    }

    // Normal render - render children directly (no wrapper div)
    return this.props.children
  }
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
