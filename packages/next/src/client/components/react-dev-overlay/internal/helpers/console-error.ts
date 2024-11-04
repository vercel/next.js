// Represent non Error shape unhandled promise rejections or console.error errors.

type UnhandledError = Error & { digest: 'NEXT_UNHANDLED_ERROR' }

// This is a custom unhandled error where we only have the stringified message without stack.
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
