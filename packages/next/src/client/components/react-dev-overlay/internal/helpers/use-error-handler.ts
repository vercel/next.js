import { useEffect } from 'react'
import { isHydrationError } from '../../../is-hydration-error'
import { attachHydrationErrorState } from './attach-hydration-error-state'

export type ErrorHandler = (error: Error) => void

let hasHydrationError = false
const errorQueue: Array<Error> = []
const errorHandlers: Array<ErrorHandler> = []
export const rejectionQueue: Array<Error> = []
export const rejectionHandlers: Array<ErrorHandler> = []

export function handleClientError(error: unknown) {
  if (!error || !(error instanceof Error) || typeof error.stack !== 'string') {
    // A non-error was thrown, we don't have anything to show. :-(
    return
  }

  attachHydrationErrorState(error)

  // Only queue one hydration every time
  if (isHydrationError(error)) {
    if (!hasHydrationError) {
      errorQueue.push(error)
    }
    hasHydrationError = true
  }
  for (const handler of errorHandlers) {
    handler(error)
  }
}

export function useErrorHandler(
  handleOnUnhandledError: ErrorHandler,
  handleOnUnhandledRejection: ErrorHandler
) {
  useEffect(() => {
    // Handle queued errors.
    errorQueue.forEach(handleOnUnhandledError)
    rejectionQueue.forEach(handleOnUnhandledRejection)

    // Listen to new errors.
    errorHandlers.push(handleOnUnhandledError)
    rejectionHandlers.push(handleOnUnhandledRejection)

    return () => {
      // Remove listeners.
      errorHandlers.splice(errorHandlers.indexOf(handleOnUnhandledError), 1)
      rejectionHandlers.splice(
        rejectionHandlers.indexOf(handleOnUnhandledRejection),
        1
      )
    }
  }, [handleOnUnhandledError, handleOnUnhandledRejection])
}
