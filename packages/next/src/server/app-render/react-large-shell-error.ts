// TODO: isWellKnownError -> isNextInternalError
// isReactLargeShellError -> isWarning
export function isReactLargeShellError(
  error: unknown
): error is Error & { digest?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.startsWith('This rendered a large document (>')
  )
}
