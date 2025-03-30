// To distinguish from React error.digest, we use a different symbol here to determine if the error is from console.error or unhandled promise rejection.
const digestSym = Symbol.for('next.console.error.digest')
const consoleTypeSym = Symbol.for('next.console.error.type')

// Represent non Error shape unhandled promise rejections or console.error errors.
// Those errors will be captured and displayed in Error Overlay.
export type ConsoleError = Error & {
  [digestSym]: 'NEXT_CONSOLE_ERROR'
  [consoleTypeSym]: 'string' | 'error'
  environmentName: string
}

export function createConsoleError(
  message: string | Error,
  environmentName?: string | null
): ConsoleError {
  const error = (
    typeof message === 'string' ? new Error(message) : message
  ) as ConsoleError
  error[digestSym] = 'NEXT_CONSOLE_ERROR'
  error[consoleTypeSym] = typeof message === 'string' ? 'string' : 'error'

  if (environmentName && !error.environmentName) {
    error.environmentName = environmentName
  }

  return error
}

export const isConsoleError = (error: any): error is ConsoleError => {
  return error && error[digestSym] === 'NEXT_CONSOLE_ERROR'
}

export const getConsoleErrorType = (error: ConsoleError) => {
  return error[consoleTypeSym]
}
