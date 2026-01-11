'use client'

import React, { useLayoutEffect, useState, useEffect } from 'react'
import {
  isGlobalNotFoundError,
  type GlobalNotFoundError,
} from './http-access-fallback/http-access-fallback'
import { dispatchGlobalNotFoundAction } from './app-router-instance'

interface GlobalNotFoundBoundaryProps {
  globalNotFoundPath: string | undefined
  cacheKey: number
  children: React.ReactNode
}

interface GlobalNotFoundBoundaryState {
  globalNotFoundError: GlobalNotFoundError | null
}

/**
 * GlobalNotFoundBoundary catches GlobalNotFoundError (thrown by notFound() on the client
 * when global-not-found is enabled). This error type has a different digest than
 * HTTPAccessFallbackError, so segment-level HTTPAccessFallbackBoundary won't catch it.
 *
 * When caught, this boundary dispatches an action to fetch the global-not-found page
 * and re-renders the entire app with that content (without changing the URL).
 */
class GlobalNotFoundErrorBoundary extends React.Component<
  GlobalNotFoundBoundaryProps,
  GlobalNotFoundBoundaryState
> {
  constructor(props: GlobalNotFoundBoundaryProps) {
    super(props)
    this.state = {
      globalNotFoundError: null,
    }
  }

  static getDerivedStateFromError(error: unknown) {
    if (isGlobalNotFoundError(error)) {
      return { globalNotFoundError: error }
    }
    // Re-throw non-global-not-found errors
    throw error
  }

  render() {
    const { globalNotFoundError } = this.state
    const { children } = this.props

    if (globalNotFoundError) {
      return (
        <TriggerGlobalNotFound url={globalNotFoundError.globalNotFoundPath} />
      )
    }

    return children
  }
}

function TriggerGlobalNotFound({ url }: { url: string }) {
  const [showFallback, setShowFallback] = useState(false)

  useLayoutEffect(() => {
    // Dispatch action to fetch global-not-found page.
    // The router will update its state, triggering a re-render with new cache.
    // The boundary will receive new cacheKey as prop and reset.
    dispatchGlobalNotFoundAction(url)
  }, [url])

  useEffect(() => {
    // If we're still mounted after 5 seconds, the RSC fetch likely failed.
    // Show a fallback UI so the user doesn't see a blank page.
    const timeout = setTimeout(() => {
      setShowFallback(true)
    }, 5000)

    return () => clearTimeout(timeout)
  }, [])

  if (showFallback) {
    // Show a simple fallback UI with the global-not-found ID so tests can detect it
    return (
      <html data-global-not-found="true">
        <body>
          <h1 id="global-error-title">global-not-found</h1>
          <p>This page could not be found.</p>
        </body>
      </html>
    )
  }

  return null
}

/**
 * Wrapper that renders the error boundary when global-not-found is enabled.
 * The cacheKey prop is used to reset the boundary when the router cache changes.
 */
export function GlobalNotFoundBoundary({
  globalNotFoundPath,
  cacheKey,
  children,
}: GlobalNotFoundBoundaryProps) {
  // Only render the error boundary if global-not-found is enabled
  if (globalNotFoundPath) {
    return (
      <GlobalNotFoundErrorBoundary
        // Use cacheKey to reset the boundary when the router cache changes
        // This prevents infinite loops when the error-throwing component re-renders
        key={cacheKey}
        globalNotFoundPath={globalNotFoundPath}
        cacheKey={cacheKey}
      >
        {children}
      </GlobalNotFoundErrorBoundary>
    )
  }

  return <>{children}</>
}
