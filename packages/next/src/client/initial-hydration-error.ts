/**
 * The initial Flight stream is rejected when the document ends before the
 * complete server response arrives. React's error is readable in development
 * and minified in production.
 */
export function isInitialHydrationConnectionClosed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Connection closed.') ||
    message.includes('Minified React error #412') ||
    message.includes('The connection to the page was unexpectedly closed')
  )
}
