/**
 * This module imports the client instrumentation hook from the project root.
 *
 * The `private-next-instrumentation-client` module is automatically aliased to
 * the `instrumentation-client.ts` file in the project root by webpack or turbopack.
 */
if (process.env.__NEXT_EXPERIMENTAL_CLIENT_INSTRUMENTATION_HOOK) {
  if (process.env.NODE_ENV === 'development') {
    const startTime = performance.now()
    require('private-next-instrumentation-client')
    const endTime = performance.now()
    console.log(
      `[Client Instrumentation Hook] executed in ${(endTime - startTime).toFixed(0)}ms (Note: Code download overhead is not included in this measurement)`
    )
  } else {
    require('private-next-instrumentation-client')
  }
}
