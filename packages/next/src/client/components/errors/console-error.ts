// To distinguish from React error.digest, we use a different symbol here to determine if the error is from console.error or unhandled promise rejection.
const digestSym = Symbol.for('next.console.error.digest')
const consoleTypeSym = Symbol.for('next.console.error.type')

// Represent non Error shape unhandled promise rejections or console.error errors.
// Those errors will be captured and displayed in Error Overlay.
type UnhandledError = Error & {
  [digestSym]: 'NEXT_UNHANDLED_ERROR'
  [consoleTypeSym]: 'string' | 'error'
}

export function createUnhandledError(message: string | Error): UnhandledError {
  const error = (
    typeof message === 'string' ? new Error(message) : message
  ) as UnhandledError
  error[digestSym] = 'NEXT_UNHANDLED_ERROR'
  error[consoleTypeSym] = typeof message === 'string' ? 'string' : 'error'
  return error
}

export const isUnhandledConsoleOrRejection = (
  error: any
): error is UnhandledError => {
  return error && error[digestSym] === 'NEXT_UNHANDLED_ERROR'
}

export const getUnhandledErrorType = (error: UnhandledError) => {
  return error[consoleTypeSym]
}
