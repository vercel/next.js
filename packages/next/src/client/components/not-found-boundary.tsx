import React from 'react'

interface NotFoundBoundaryProps {
  notFound?: React.ReactNode
  notFoundStyles?: React.ReactNode
  asNotFound?: boolean
  children: React.ReactNode
}

class NotFoundErrorBoundary extends React.Component<
  NotFoundBoundaryProps,
  { notFoundTriggered: boolean }
> {
  constructor(props: NotFoundBoundaryProps) {
    super(props)
    this.state = { notFoundTriggered: !!props.asNotFound }
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
  return notFound ? (
    <NotFoundErrorBoundary
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
