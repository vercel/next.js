// This file contains simple state variables for global-not-found feature.
// It's kept separate from app-router-instance.ts to avoid pulling in
// heavy client-only dependencies when imported from not-found.ts
// (which is used in both client and server contexts).

let globalNotFoundPath: string | null = null
let hasAppHydrated = false

export function setGlobalNotFoundPath(path: string | undefined) {
  globalNotFoundPath = path ?? null
}

export function getGlobalNotFoundPath(): string | null {
  return globalNotFoundPath
}

/**
 * Marks the app as hydrated. This should be called after the first client-side
 * render completes. Until this is called, notFound() will behave as it does
 * during SSR (throw HTTPAccessFallbackError instead of GlobalNotFoundError).
 */
export function markAppAsHydrated() {
  hasAppHydrated = true
}

/**
 * Returns true if the app has completed its initial hydration.
 * This is used by notFound() to determine whether to throw GlobalNotFoundError
 * (which triggers global-not-found) or HTTPAccessFallbackError (which triggers
 * the segment-level not-found boundary).
 */
export function isAppHydrated(): boolean {
  return hasAppHydrated
}
