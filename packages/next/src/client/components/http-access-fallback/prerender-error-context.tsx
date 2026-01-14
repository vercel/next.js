'use client'

import { createContext, useContext } from 'react'
import type { HTTPAccessErrorStatus } from './http-access-fallback'

/**
 * The HTTP status code type (404, 403, or 401).
 */
type HTTPAccessErrorStatusCode =
  (typeof HTTPAccessErrorStatus)[keyof typeof HTTPAccessErrorStatus]

/**
 * State for pre-triggering HTTP access error boundaries during server prerender.
 * When set, HTTPAccessFallbackBoundary will immediately render the appropriate
 * fallback component without waiting for an error to be thrown.
 */
export type PrerenderHTTPErrorState = {
  triggeredStatus: HTTPAccessErrorStatusCode
} | null

/**
 * Context for passing prerender HTTP error state to error boundaries.
 * Used when notFound(), forbidden(), or unauthorized() is called at the page level
 * (outside any Suspense boundary) during cacheComponents prerender.
 */
export const PrerenderHTTPErrorContext =
  createContext<PrerenderHTTPErrorState>(null)

/**
 * Hook to access the prerender HTTP error state.
 * Returns null if no error state is set (normal rendering).
 */
export function usePrerenderHTTPError(): PrerenderHTTPErrorState {
  return useContext(PrerenderHTTPErrorContext)
}
