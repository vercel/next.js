'use client'

import React, { useContext } from 'react'
import {
  useUntrackedPathname,
  useUntrackedSearchParams,
} from './navigation-untracked'
import { isNotFoundError } from './not-found'
import { warnOnce } from '../../shared/lib/utils/warn-once'
import { MissingSlotContext } from '../../shared/lib/app-router-context.shared-runtime'

interface NotFoundBoundaryProps {
  notFound?: React.ReactNode
  notFoundStyles?: React.ReactNode
  asNotFound?: boolean
  children: React.ReactNode
  missingSlots?: Set<string>
}

interface NotFoundErrorBoundaryProps extends NotFoundBoundaryProps {
  pathname: string | null
  searchParams: URLSearchParams | null
  missingSlots?: Set<string>
}

interface NotFoundErrorBoundaryState {
  notFoundTriggered: boolean
  previousPathname: string | null
  previousSearchParams: URLSearchParams | null
}

class NotFoundErrorBoundary extends React.Component<
  NotFoundErrorBoundaryProps,
  NotFoundErrorBoundaryState
> {
  constructor(props: NotFoundErrorBoundaryProps) {
    super(props)
    this.state = {
      notFoundTriggered: !!props.asNotFound,
      previousPathname: props.pathname,
      previousSearchParams: props.searchParams,
    }
  }

  componentDidCatch(): void {
    if (
      process.env.NODE_ENV === 'development' &&
      this.props.missingSlots &&
      // A missing children slot is the typical not-found case, so no need to warn
      !this.props.missingSlots.has('children')
    ) {
      let warningMessage =
        'No default component was found for a parallel route rendered on this page. Falling back to nearest NotFound boundary.\n' +
        'Learn more: https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#defaultjs\n\n'

      if (this.props.missingSlots.size > 0) {
        const formattedSlots = Array.from(this.props.missingSlots)
          .sort((a, b) => a.localeCompare(b))
          .map((slot) => `@${slot}`)
          .join(', ')

        warningMessage += 'Missing slots: ' + formattedSlots
      }

      warnOnce(warningMessage)
    }
  }

  static getDerivedStateFromError(error: any) {
    if (isNotFoundError(error)) {
      return {
        notFoundTriggered: true,
      }
    }
    // Re-throw if error is not for 404
    throw error
  }

  static getDerivedStateFromProps(
    props: NotFoundErrorBoundaryProps,
    state: NotFoundErrorBoundaryState
  ): NotFoundErrorBoundaryState | null {
    /**
     * Handles reset of the error boundary when a navigation happens.
     * Ensures the error boundary does not stay enabled when navigating to a new page or when search params change.
     * Approach of setState in render is safe as it checks the previous pathname and then overrides
     * it as outlined in https://react.dev/reference/react/useState#storing-information-from-previous-renders
     */
    if (
      (props.pathname !== state.previousPathname ||
        props.searchParams !== state.previousSearchParams) &&
      state.notFoundTriggered
    ) {
      return {
        notFoundTriggered: false,
        previousPathname: props.pathname,
        previousSearchParams: props.searchParams,
      }
    }
    return {
      notFoundTriggered: state.notFoundTriggered,
      previousPathname: props.pathname,
      previousSearchParams: props.searchParams,
    }
  }

  render() {
    if (this.state.notFoundTriggered) {
      return (
        <>
          <meta name="robots" content="noindex" />
          {process.env.NODE_ENV === 'development' && (
            <meta name="next-error" content="not-found" />
          )}
          {this.props.notFoundStyles}
          {this.props.notFound}
        </>
      )
    }

    return this.props.children
  }
}

export function NotFoundBoundary({
  notFound,
  notFoundStyles,
  asNotFound,
  children,
}: NotFoundBoundaryProps) {
  // When we're rendering the missing params shell, this will return null. This
  // is because we won't be rendering any not found boundaries or error
  // boundaries for the missing params shell. When this runs on the client
  // (where these error can occur), we will get the correct pathname.
  const pathname = useUntrackedPathname()
  const searchParams = useUntrackedSearchParams()
  const missingSlots = useContext(MissingSlotContext)

  if (notFound) {
    return (
      <NotFoundErrorBoundary
        pathname={pathname}
        notFound={notFound}
        notFoundStyles={notFoundStyles}
        asNotFound={asNotFound}
        missingSlots={missingSlots}
        searchParams={searchParams}
      >
        {children}
      </NotFoundErrorBoundary>
    )
  }

  return <>{children}</>
}
