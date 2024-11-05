// Represent non Error shape unhandled promise rejections or console.error errors.
// Those errors will be captured and displayed in Error Overlay.
type UnhandledError = Error & { digest: 'NEXT_UNHANDLED_ERROR' }

export function createUnhandledError(message: string): UnhandledError {
  const error = new Error(message) as UnhandledError
  error.digest = 'NEXT_UNHANDLED_ERROR'
  return error
}

export const isUnhandledConsoleOrRejection = (
  error: any
): error is UnhandledError => {
  return error && error.digest === 'NEXT_UNHANDLED_ERROR'
}
