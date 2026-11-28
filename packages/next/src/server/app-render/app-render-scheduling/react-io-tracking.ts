let AsyncResource: typeof import('node:async_hooks').AsyncResource | undefined
if (
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_RUNTIME !== 'edge'
) {
  try {
    AsyncResource = (
      require('node:async_hooks') as typeof import('node:async_hooks')
    ).AsyncResource
  } catch {
    // React's IO tracking does not work in runtimes without async_hooks anyway.
  }
} else {
  AsyncResource = undefined
}

/**
 * Executes a callback in a way that should be tracked as IO by React.
 * Only relevant in development, where IO tracking is enabled.
 * */
export function runAsIOForReactIOTracking(callback: () => void): void {
  // React's IO tracking does not normally consider `setImmediate` or
  // `process.nextTick` IO, and we use sequential tasks to resolve framework
  // promises that should be considered "triggered by IO". As a result, some
  // schedulers need to make React believe that their tasks are IO.
  //
  // The filtering of "IO or not IO" that React does is pretty coarse --
  // it uses the Async Resource's type:
  // https://github.com/react/react/blob/edae846a9a17442c00429f2b15375afbfa0376c9/packages/react-server/src/ReactFlightServerConfigDebugNode.js#L145-L153
  // This means that we can bypass it by creating an async resource with
  // a type that passes the filter.
  //
  // (NOTE: React may still inherit the parent's tracking
  // rather than create a new IO node, just as it would for a real timer)
  //
  // see also: tests in react-performance-track.test.ts

  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_RUNTIME !== 'edge' &&
    typeof AsyncResource === 'function'
  ) {
    const resource = new AsyncResource('NEXTJS_SYNTHETIC_IO', {
      requireManualDestroy: true,
    })
    try {
      return resource.runInAsyncScope(callback, undefined)
    } finally {
      resource.emitDestroy()
    }
  } else {
    return callback()
  }
}
