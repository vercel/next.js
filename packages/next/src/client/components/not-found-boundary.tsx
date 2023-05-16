import React from 'react'
import { usePathname } from './navigation'

interface NotFoundBoundaryProps {
  notFound?: React.ReactNode
  notFoundStyles?: React.ReactNode
  asNotFound?: boolean
  children: React.ReactNode
}

interface NotFoundErrorBoundaryProps extends NotFoundBoundaryProps {
  pathname: string
}

class NotFoundErrorBoundary extends React.Component<
  NotFoundErrorBoundaryProps,
  { notFoundTriggered: boolean; previousPathname: string }
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

  render() {
    if (this.state.notFoundTriggered) {
      /**
       * Handles reset of the error boundary when a navigation happens.
       * Ensures the error boundary does not stay enabled when navigating to a new page.
       * Approach of setState in render is safe as it checks the previous pathname and then overrides
       * it as outlined in https://react.dev/reference/react/useState#storing-information-from-previous-renders
       */
      if (
        this.props.pathname !== this.state.previousPathname &&
        this.state.notFoundTriggered
      ) {
        this.setState((_state) => {
          return {
            notFoundTriggered: false,
            previousPathname: this.props.pathname,
          }
        })
      }

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
  const pathname = usePathname()
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
