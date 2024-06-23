import { useEffect } from 'react'
import {
  hydrationErrorState,
  getReactHydrationDiffSegments,
} from './hydration-error-info'
import { isNextRouterError } from '../../../is-next-router-error'
import {
  isHydrationError,
  getDefaultHydrationErrorMessage,
} from '../../../is-hydration-error'

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

if (typeof window !== 'undefined') {
  function handleError(error: unknown) {
    if (isNextRouterError(error)) {
      return false
    }

    if (
      !error ||
      !(error instanceof Error) ||
      typeof error.stack !== 'string'
    ) {
      // A non-error was thrown, we don't have anything to show. :-(
      return
    }

    const isCausedByHydrationFailure = isHydrationError(error)
    if (
      isHydrationError(error) &&
      !error.message.includes(
        'https://nextjs.org/docs/messages/react-hydration-error'
      )
    ) {
      const reactHydrationDiffSegments = getReactHydrationDiffSegments(
        error.message
      )
      let parsedHydrationErrorState: typeof hydrationErrorState = {}
      if (reactHydrationDiffSegments) {
        parsedHydrationErrorState = {
          ...(error as any).details,
          ...hydrationErrorState,
          warning: hydrationErrorState.warning || [
            getDefaultHydrationErrorMessage(),
          ],
          notes: reactHydrationDiffSegments[0],
          reactOutputComponentDiff: reactHydrationDiffSegments[1],
        }
      } else {
        // If there's any extra information in the error message to display,
        // append it to the error message details property
        if (hydrationErrorState.warning) {
          // The patched console.error found hydration errors logged by React
          // Append the logged warning to the error message
          parsedHydrationErrorState = {
            ...(error as any).details,
            // It contains the warning, component stack, server and client tag names
            ...hydrationErrorState,
          }
        }
        error.message +=
          '\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error'
      }
      ;(error as any).details = parsedHydrationErrorState
    }

    // Only queue one hydration every time
    if (isCausedByHydrationFailure) {
      if (!hasHydrationError) {
        errorQueue.push(error)
      }
      hasHydrationError = true
    }
    for (const handler of errorHandlers) {
      handler(error)
    }
  }
  // These event handlers must be added outside of the hook because there is no
  // guarantee that the hook will be alive in a mounted component in time to
  // when the errors occur.
  // uncaught errors go through reportError
  window.addEventListener(
    'error',
    (event: WindowEventMap['error']): void | boolean => {
      if (handleError(event.error) === false) {
        event.preventDefault()
        return false
      }
    }
  )
  // caught errors go through console.error
  const origConsoleError = window.console.error
  window.console.error = (...args) => {
    // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
    const error = process.env.NODE_ENV !== 'production' ? args[1] : args[0]
    if (handleError(error) !== false) {
      origConsoleError.apply(window.console, args)
    }
  }
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
