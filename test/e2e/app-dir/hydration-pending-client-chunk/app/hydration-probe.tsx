'use client'

// Renders above the page segment, so it renders on every attempt to hydrate
// the root. The test uses it to know that hydration has started.
export function HydrationProbe() {
  if (typeof window !== 'undefined') {
    ;(window as any).__hydrationAttempts =
      ((window as any).__hydrationAttempts ?? 0) + 1
  }
  return null
}
