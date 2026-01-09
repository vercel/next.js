'use client'

import React, { useEffect } from 'react'
import {
  HTTPAccessErrorStatus,
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from './http-access-fallback/http-access-fallback'
import { dispatchGlobalNotFoundAction } from './app-router-instance'

interface GlobalNotFoundBoundaryProps {
  globalNotFoundPath: string | undefined
  children: React.ReactNode
}

interface GlobalNotFoundBoundaryState {
  hasNotFoundError: boolean
}

/**
 * GlobalNotFoundBoundary catches NOT_FOUND errors that bubble up when no
 * segment-level not-found boundary handles them. When global-not-found is
 * enabled and the error occurs after client-side mount (not during SSR),
 * it triggers an async fetch to render the global not-found page.
 */
class GlobalNotFoundErrorBoundary extends React.Component<
  GlobalNotFoundBoundaryProps,
  GlobalNotFoundBoundaryState
> {
  // Track if this component has been mounted on the client.
  // Used to distinguish between SSR/hydration errors and client-side interaction errors.
  private hasBeenMounted = false

  constructor(props: GlobalNotFoundBoundaryProps) {
    super(props)
    this.state = {
      hasNotFoundError: false,
    }
  }

  componentDidMount(): void {
    this.hasBeenMounted = true
  }

  static getDerivedStateFromError(error: unknown) {
    if (isHTTPAccessFallbackError(error)) {
      const httpStatus = getAccessFallbackHTTPStatus(error)
      if (httpStatus === HTTPAccessErrorStatus.NOT_FOUND) {
        return { hasNotFoundError: true }
      }
    }
    // Re-throw non-not-found errors
    throw error
  }

  render() {
    const { hasNotFoundError } = this.state
    const { globalNotFoundPath, children } = this.props

    // Only trigger global not-found for client-side interactions (after mount)
    // and when globalNotFoundPath is configured
    if (hasNotFoundError && globalNotFoundPath && this.hasBeenMounted) {
      return <TriggerGlobalNotFound url={globalNotFoundPath} />
    }

    return children
  }
}

function TriggerGlobalNotFound({ url }: { url: string }) {
  useEffect(() => {
    dispatchGlobalNotFoundAction(url)
  }, [url])

  return null
}

export function GlobalNotFoundBoundary({
  globalNotFoundPath,
  children,
}: GlobalNotFoundBoundaryProps) {
  // Only render the error boundary if global-not-found is enabled
  if (globalNotFoundPath) {
    return (
      <GlobalNotFoundErrorBoundary globalNotFoundPath={globalNotFoundPath}>
        {children}
      </GlobalNotFoundErrorBoundary>
    )
  }

  return children
}
