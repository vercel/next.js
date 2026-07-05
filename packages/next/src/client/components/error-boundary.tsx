'use client'

import React, { startTransition, type JSX } from 'react'
import { useUntrackedPathname } from './navigation-untracked'
import { isNextRouterError } from './is-next-router-error'
import { handleHardNavError } from './nav-failure-handler'
import { handleISRError } from './handle-isr-error'
import { isBot } from '../../shared/lib/router/utils/is-bot'
import {
  AppRouterContext,
  type AppRouterInstance,
} from '../../shared/lib/app-router-context.shared-runtime'

const isBotUserAgent =
  typeof window !== 'undefined' && isBot(window.navigator.userAgent)

export type ErrorInfo = {
  error: unknown
  reset: () => void
  retry: () => void
}

export type ErrorComponent = React.ComponentType<ErrorInfo>

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
  error: null | { thrownValue: unknown }
  previousPathname: string | null
}

export class ErrorBoundaryHandler extends React.Component<
  ErrorBoundaryHandlerProps,
  ErrorBoundaryHandlerState
> {
  static contextType = AppRouterContext
  declare context: AppRouterInstance | null

  constructor(props: ErrorBoundaryHandlerProps) {
    super(props)
    this.state = {
      error: null,
      previousPathname: this.props.pathname,
    }
  }

  static getDerivedStateFromError(
    thrownValue: unknown
  ): Partial<ErrorBoundaryHandlerState> {
    if (isNextRouterError(thrownValue)) {
      // Re-throw if an expected internal Next.js router error occurs
      // this means it should be handled by a different boundary (such as a NotFound boundary in a parent segment)
      throw thrownValue
    }

    return { error: { thrownValue } }
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
      if (error && handleHardNavError(error.thrownValue)) {
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

  retry = () => {
    startTransition(() => {
      this.context?.refresh()
      this.reset()
    })
  }

  // Explicit type is needed to avoid the generated `.d.ts` having a wide return type that could be specific to the `@types/react` version.
  render(): React.ReactNode {
    //When it's bot request, segment level error boundary will keep rendering the children,
    // the final error will be caught by the root error boundary and determine wether need to apply graceful degrade.
    if (this.state.error && !isBotUserAgent) {
      const thrownValue = this.state.error.thrownValue
      handleISRError({ error: thrownValue })

      return (
        <>
          {this.props.errorStyles}
          {this.props.errorScripts}
          <this.props.errorComponent
            // TODO(NAR-804): Docs say this is an Error object, but we don't guarantee that
            error={thrownValue}
            reset={this.reset}
            retry={this.retry}
          />
        </>
      )
    }

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
