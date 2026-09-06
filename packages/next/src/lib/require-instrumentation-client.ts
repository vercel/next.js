/**
 * This module imports the configured client instrumentation modules.
 *
 * The `private-next-instrumentation-client` module is automatically aliased to
 * either the user's instrumentation module or a generated module array.
 */
if (process.env.NODE_ENV === 'development') {
  const measureName = 'Client Instrumentation Hook'
  const startTime = performance.now()
  // eslint-disable-next-line @next/internal/typechecked-require -- Not a module.
  const instrumentationClient = require('private-next-instrumentation-client')
  module.exports = Array.isArray(instrumentationClient)
    ? instrumentationClient
    : [instrumentationClient]
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
  const instrumentationClient = require('private-next-instrumentation-client')
  module.exports = Array.isArray(instrumentationClient)
    ? instrumentationClient
    : [instrumentationClient]
}
