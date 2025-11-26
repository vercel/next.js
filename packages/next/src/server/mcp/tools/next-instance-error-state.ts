/**
 * Global error state for Next.js instance-level errors that are not associated
 * with a specific browser session or route. This state is exposed through the MCP server's `get_errors`
 * tool as well. This covers the errors that are global to the Next.js instance, such as errors in next.config.js.
 *
 *
 * ## Usage
 *
 * This state is directly manipulated by various parts of the Next.js dev server:
 *
 * // Reset the error state
 * NextInstanceErrorState.[errorType] = []
 *
 * // Capture an error for a specific error type
 * NextInstanceErrorState.[errorType].push(err)
 *
 */
export const NextInstanceErrorState: {
  nextConfig: unknown[]
} = {
  nextConfig: [],
}
