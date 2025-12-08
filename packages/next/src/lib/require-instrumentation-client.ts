/**
 * This module imports the client instrumentation hook from the project root.
 *
 * The `private-next-instrumentation-client` module is automatically aliased to
 * the `instrumentation-client.ts` file in the project root by webpack or turbopack.
 */

// Initialize waterfall detector FIRST (before any other code runs)
// This must happen before the instrumentation client is loaded to patch fetch early
let disableWaterfallDetector: (() => void) | null = null
if (process.env.__NEXT_PROFILER_BUILD) {
  const waterfallDetector =
    require('../client/waterfall-detector') as typeof import('../client/waterfall-detector')
  waterfallDetector.initWaterfallDetector()
  disableWaterfallDetector = waterfallDetector.disableWaterfallDetector
}

let userHooks: Record<string, any> = {}
if (process.env.NODE_ENV === 'development') {
  const measureName = 'Client Instrumentation Hook'
  const startTime = performance.now()
  // eslint-disable-next-line @next/internal/typechecked-require -- Not a module.
  userHooks = require('private-next-instrumentation-client')
  const endTime = performance.now()
  const duration = endTime - startTime

  // Using 16ms threshold as it represents one frame (1000ms/60fps)
  // This helps identify if the instrumentation hook initialization
  // could potentially cause frame drops during development.
  const THRESHOLD = 16
  if (duration > THRESHOLD) {
    console.log(
      `[${measureName}] Slow execution detected: ${duration.toFixed(0)}ms (Note: Code download overhead is not included in this measurement)`
    )
  }
} else {
  // eslint-disable-next-line @next/internal/typechecked-require -- Not a module.
  userHooks = require('private-next-instrumentation-client')
}

// Compose onRouterTransitionStart: disable waterfall detector, then call user hook
const userOnRouterTransitionStart = userHooks.onRouterTransitionStart
const composedOnRouterTransitionStart =
  disableWaterfallDetector || userOnRouterTransitionStart
    ? (url: string, navigationType: 'push' | 'replace' | 'traverse') => {
        // Disable waterfall detector on any client-side navigation
        disableWaterfallDetector?.()
        // Call user's hook if provided
        userOnRouterTransitionStart?.(url, navigationType)
      }
    : undefined

module.exports = {
  ...userHooks,
  onRouterTransitionStart: composedOnRouterTransitionStart,
}
