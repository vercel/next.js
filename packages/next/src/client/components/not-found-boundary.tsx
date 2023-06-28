import React, { useContext } from 'react'
import { PathnameContext } from '../../shared/lib/hooks-client-context'

interface NotFoundBoundaryProps {
  notFound?: React.ReactNode
  notFoundStyles?: React.ReactNode
  asNotFound?: boolean
  children: React.ReactNode
}

interface NotFoundErrorBoundaryProps extends NotFoundBoundaryProps {
  pathname: string
}

interface NotFoundErrorBoundaryState {
  notFoundTriggered: boolean
  previousPathname: string
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
    }
  }

  static getDerivedStateFromError(error: any) {
    if (error?.digest === 'NEXT_NOT_FOUND') {
      return { notFoundTriggered: true }
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
     * Ensures the error boundary does not stay enabled when navigating to a new page.
     * Approach of setState in render is safe as it checks the previous pathname and then overrides
     * it as outlined in https://react.dev/reference/react/useState#storing-information-from-previous-renders
     */
    if (props.pathname !== state.previousPathname && state.notFoundTriggered) {
      return {
        notFoundTriggered: false,
        previousPathname: props.pathname,
      }
    }
    return {
      notFoundTriggered: state.notFoundTriggered,
      previousPathname: props.pathname,
    }
  }

  render() {
    if (this.state.notFoundTriggered) {
      return (
        <>
          <meta name="robots" content="noindex" />
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
  // FIXME: Reading pathname from PathnameContext directly instead of `next/navigation`
  // to prevent the entire navigation.ts from being introduced to the client bundle due
  // to the inefficient tree-shaking. This is only a temporary workaround and we need to
  // look into the tree-shaking issue in the future.
  const pathname = useContext(PathnameContext) as string

  return notFound ? (
    <NotFoundErrorBoundary
      pathname={pathname}
      notFound={notFound}
      notFoundStyles={notFoundStyles}
      asNotFound={asNotFound}
    >
      {children}
    </NotFoundErrorBoundary>
  ) : (
    <>{children}</>
  )
}
