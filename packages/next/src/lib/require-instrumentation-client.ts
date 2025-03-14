/**
 * This module imports the client instrumentation hook from the project root.
 *
 * The `private-next-instrumentation-client` module is automatically aliased to
 * the `instrumentation-client.ts` file in the project root by webpack or turbopack.
 */

if (process.env.__NEXT_EXPERIMENTAL_CLIENT_INSTRUMENTATION_HOOK) {
  require('private-next-instrumentation-client')
}
