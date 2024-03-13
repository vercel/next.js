'use client'

import React, { useContext } from 'react'
import { usePathname } from './navigation'
import { warnOnce } from '../../shared/lib/utils/warn-once'
import { MissingSlotContext } from '../../shared/lib/app-router-context.shared-runtime'
import { isForbiddenError } from './forbidden'

interface ForbiddenBoundaryProps {
  forbidden?: React.ReactNode
  forbiddenStyles?: React.ReactNode
  asNotFound?: boolean
  children: React.ReactNode
}

interface ForbiddenErrorBoundaryProps extends ForbiddenBoundaryProps {
  pathname: string
  missingSlots: Set<string>
}

interface ForbiddenErrorBoundaryState {
  forbiddenTriggered: boolean
  previousPathname: string
}

class ForbiddenErrorBoundary extends React.Component<
  ForbiddenErrorBoundaryProps,
  ForbiddenErrorBoundaryState
> {
  constructor(props: ForbiddenErrorBoundaryProps) {
    super(props)
    this.state = {
      forbiddenTriggered: !!props.asNotFound,
      previousPathname: props.pathname,
    }
  }

  componentDidCatch(): void {
    if (
      process.env.NODE_ENV === 'development' &&
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
    if (isForbiddenError(error)) {
      return {
        forbiddenTriggered: true,
      }
    }
    // Re-throw if error is not for 404
    throw error
  }

  static getDerivedStateFromProps(
    props: ForbiddenErrorBoundaryProps,
    state: ForbiddenErrorBoundaryState
  ): ForbiddenErrorBoundaryState | null {
    /**
     * Handles reset of the error boundary when a navigation happens.
     * Ensures the error boundary does not stay enabled when navigating to a new page.
     * Approach of setState in render is safe as it checks the previous pathname and then overrides
     * it as outlined in https://react.dev/reference/react/useState#storing-information-from-previous-renders
     */
    if (props.pathname !== state.previousPathname && state.forbiddenTriggered) {
      return {
        forbiddenTriggered: false,
        previousPathname: props.pathname,
      }
    }
    return {
      forbiddenTriggered: state.forbiddenTriggered,
      previousPathname: props.pathname,
    }
  }

  render() {
    if (this.state.forbiddenTriggered) {
      return (
        <>
          <meta name="robots" content="noindex" />
          {process.env.NODE_ENV === 'development' && (
            <meta name="next-error" content="not-found" />
          )}
          {this.props.forbiddenStyles}
          {this.props.forbidden}
        </>
      )
    }

    return this.props.children
  }
}

export function ForbiddenBoundary({
  forbidden,
  forbiddenStyles,
  asNotFound,
  children,
}: ForbiddenBoundaryProps) {
  const pathname = usePathname()
  const missingSlots = useContext(MissingSlotContext)
  return forbidden ? (
    <ForbiddenErrorBoundary
      pathname={pathname}
      forbidden={forbidden}
      forbiddenStyles={forbiddenStyles}
      asNotFound={asNotFound}
      missingSlots={missingSlots}
    >
      {children}
    </ForbiddenErrorBoundary>
  ) : (
    <>{children}</>
  )
}
