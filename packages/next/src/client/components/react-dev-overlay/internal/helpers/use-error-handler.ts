import { useEffect } from 'react'

import { isNextRouterError } from '../../../is-next-router-error'
import { isHydrationError } from '../../../is-hydration-error'
import { attachHydrationErrorState } from './attach-hydration-error-state'

export type ErrorHandler = (error: Error) => void

if (typeof window !== 'undefined') {
  try {
    // Increase the number of stack frames on the client
    Error.stackTraceLimit = 50
  } catch {}
}

let hasHydrationError = false
const errorQueue: Array<Error> = []
const rejectionQueue: Array<Error> = []
const errorHandlers: Array<ErrorHandler> = []
const rejectionHandlers: Array<ErrorHandler> = []

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
if (typeof window !== 'undefined') {
  // These event handlers must be added outside of the hook because there is no
  // guarantee that the hook will be alive in a mounted component in time to
  // when the errors occur.
  // uncaught errors go through reportError
  window.addEventListener(
    'error',
    (event: WindowEventMap['error']): void | boolean => {
      if (isNextRouterError(event.error)) {
        event.preventDefault()
        return false
      }
      handleClientError(event.error)
    }
  )

  window.addEventListener(
    'unhandledrejection',
    (ev: WindowEventMap['unhandledrejection']): void => {
      const reason = ev?.reason
      if (
        !reason ||
        !(reason instanceof Error) ||
        typeof reason.stack !== 'string'
      ) {
        // A non-error was thrown, we don't have anything to show. :-(
        return
      }

      const e = reason
      rejectionQueue.push(e)
      for (const handler of rejectionHandlers) {
        handler(e)
      }
    }
  )
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
