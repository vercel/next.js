/**
 * This module imports the client instrumentation hook from the project root.
 *
 * The `private-next-instrumentation-client` module is automatically aliased to
 * the `instrumentation-client.ts` file in the project root by webpack or turbopack.
 */
if (process.env.__NEXT_EXPERIMENTAL_CLIENT_INSTRUMENTATION_HOOK) {
  if (process.env.NODE_ENV === 'development') {
    const measureName = 'Client Instrumentation Hook'
    const startTime = performance.now()
    require('private-next-instrumentation-client')
    const endTime = performance.now()

    const duration = endTime - startTime
    performance.measure(measureName, {
      start: startTime,
      end: endTime,
      detail: 'Client instrumentation initialization',
    })

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
    require('private-next-instrumentation-client')
  }
}
