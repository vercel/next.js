'use client'

import type { ErrorInfo } from './error-boundary'
import type { AppRouterInstance } from '../../shared/lib/app-router-context.shared-runtime'

import React, { startTransition, useContext } from 'react'

import { useUntrackedPathname } from './navigation-untracked'
import { isNextRouterError } from './is-next-router-error'
import { handleHardNavError } from './nav-failure-handler'
import { handleISRError } from './handle-isr-error'
import { isBot } from '../../shared/lib/router/utils/is-bot'
import { AppRouterContext } from '../../shared/lib/app-router-context.shared-runtime'
import { RouterContext as PagesRouterContext } from '../../shared/lib/router-context.shared-runtime'

const isBotUserAgent =
  typeof window !== 'undefined' && isBot(window.navigator.userAgent)

type UserProps = Record<string, any>

type CatchErrorProps<P extends UserProps> = {
  pathname: string | null
  isPagesRouter: boolean
  fallback: React.ComponentType<{
    props: P
    errorInfo: ErrorInfo
  }>
  props: P
  children: React.ReactNode
}

type CatchErrorState = {
  error: null | { thrownValue: unknown }
  previousPathname: string | null
}

// This is forked from error-boundary.
// TODO: Extend it instead of forking to easily sync the behavior?
class CatchError<P extends UserProps> extends React.Component<
  CatchErrorProps<P>,
  CatchErrorState
> {
  declare context: AppRouterInstance | null
  static contextType = AppRouterContext
  // `unstable_catchError()` is parsed as an HOC-style name and displays as
  // a label (<name> [unstable_catchError]) in DevTools.
  static displayName = 'unstable_catchError(Next.CatchError)'

  constructor(props: CatchErrorProps<P>) {
    super(props)
    this.state = {
      error: null,
      previousPathname: this.props.pathname,
    }
  }

  static getDerivedStateFromError(
    thrownValue: unknown
  ): Partial<CatchErrorState> {
    if (isNextRouterError(thrownValue)) {
      // Re-throw if an expected internal Next.js router error occurs
      // this means it should be handled by a different boundary (such as a NotFound boundary in a parent segment)
      throw thrownValue
    }

    return { error: { thrownValue } }
  }

  static getDerivedStateFromProps(
    props: CatchErrorProps<UserProps>,
    state: CatchErrorState
  ): CatchErrorState | null {
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

  unstable_retry = () => {
    if (this.props.isPagesRouter) {
      throw new Error(
        '`unstable_retry()` can only be used in the App Router. Use `reset()` in the Pages Router.'
      )
    }

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
        <this.props.fallback
          props={this.props.props}
          errorInfo={{
            // TODO(NAR-804): Docs say this is an Error object, but we don't guarantee that
            error: thrownValue,
            reset: this.reset,
            unstable_retry: this.unstable_retry,
          }}
        />
      )
    }

    return this.props.children
  }
}

/**
 * `unstable_catchError` is a counterpart to `error.js` that provides a granular
 * control of error boundaries at the component level. It provides the `ErrorInfo`
 * including `unstable_retry` for error recovery.
 *
 * Pass a Component-like fallback function that receives the props and `ErrorInfo`.
 * The props omit `children` intentionally as it is the "fallback" of the error and
 * is not expected to render the children.
 *
 * This API is must be used inside the client module graph and cannot be imported
 * in `server-only` environments like proxy, instrumentation, etc.
 *
 * @example
 * ```tsx
 * // CustomErrorBoundary.tsx
 * 'use client'
 * import { unstable_catchError, type ErrorInfo } from 'next/error'
 *
 * function CustomErrorBoundary(props: Props, errorInfo: ErrorInfo) {
 *   return ...
 * }
 *
 * export default unstable_catchError(CustomErrorBoundary)
 *
 * // page.tsx
 * 'use client'
 * import CustomErrorBoundary from './CustomErrorBoundary'
 *
 * export default function Page() {
 *   return (
 *     <CustomErrorBoundary>
 *       ...
 *     </CustomErrorBoundary>
 *   )
 * }
 * ```
 */
export function unstable_catchError<P extends UserProps>(
  fallback: (
    // children is omitted by design as the error fallback component is the "fallback"
    // for the children when an error occurs.
    props: P,
    errorInfo: ErrorInfo
  ) => React.ReactNode
): React.ComponentType<P & { children?: React.ReactNode }> {
  // Create Fallback component from the closure of `unstable_catchError`.
  const Fallback = ({ props, errorInfo }: { props: P; errorInfo: ErrorInfo }) =>
    fallback(props, errorInfo)

  // Rename to match the user component name for DevTools.
  Fallback.displayName = fallback.name || 'CatchErrorFallback'

  return ({ children, ...props }: P & { children?: React.ReactNode }) => {
    // When we're rendering the missing params shell, this will return null. This
    // is because we won't be rendering any not found boundaries or error
    // boundaries for the missing params shell. When this runs on the client
    // (where these errors can occur), we will get the correct pathname.
    const pathname = useUntrackedPathname()
    const isPagesRouter = useContext(PagesRouterContext) !== null

    return (
      <CatchError
        pathname={pathname}
        isPagesRouter={isPagesRouter}
        fallback={Fallback}
        props={props as P}
      >
        {children}
      </CatchError>
    )
  }
}
