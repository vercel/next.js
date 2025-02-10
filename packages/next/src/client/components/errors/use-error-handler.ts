import { useEffect } from 'react'
import { attachHydrationErrorState } from './attach-hydration-error-state'
import { isNextRouterError } from '../is-next-router-error'
import { storeHydrationErrorStateFromConsoleArgs } from './hydration-error-info'
import { formatConsoleArgs } from '../../lib/console'
import isError from '../../../lib/is-error'
import { createUnhandledError } from './console-error'
import { enqueueConsecutiveDedupedError } from './enqueue-client-error'
import { getReactStitchedError } from '../errors/stitched-error'

const queueMicroTask =
  globalThis.queueMicrotask || ((cb: () => void) => Promise.resolve().then(cb))

export type ErrorHandler = (error: Error) => void

const errorQueue: Array<Error> = []
const errorHandlers: Array<ErrorHandler> = []
const rejectionQueue: Array<Error> = []
const rejectionHandlers: Array<ErrorHandler> = []

export function handleClientError(
  originError: unknown,
  consoleErrorArgs: any[],
  capturedFromConsole: boolean = false
) {
  let error: Error
  if (!originError || !isError(originError)) {
    // If it's not an error, format the args into an error
    const formattedErrorMessage = formatConsoleArgs(consoleErrorArgs)
    error = createUnhandledError(formattedErrorMessage)
  } else {
    error = capturedFromConsole
      ? createUnhandledError(originError)
      : originError
  }
  error = getReactStitchedError(error)

  storeHydrationErrorStateFromConsoleArgs(...consoleErrorArgs)
  attachHydrationErrorState(error)

  enqueueConsecutiveDedupedError(errorQueue, error)
  for (const handler of errorHandlers) {
    // Delayed the error being passed to React Dev Overlay,
    // avoid the state being synchronously updated in the component.
    queueMicroTask(() => {
      handler(error)
    })
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

      // Reset error queues.
      errorQueue.splice(0, errorQueue.length)
      rejectionQueue.splice(0, rejectionQueue.length)
    }
  }, [handleOnUnhandledError, handleOnUnhandledRejection])
}

function onUnhandledError(event: WindowEventMap['error']): void | boolean {
  if (isNextRouterError(event.error)) {
    event.preventDefault()
    return false
  }
  // When there's an error property present, we log the error to error overlay.
  // Otherwise we don't do anything as it's not logging in the console either.
  if (event.error) {
    handleClientError(event.error, [])
  }
}

function onUnhandledRejection(ev: WindowEventMap['unhandledrejection']): void {
  const reason = ev?.reason
  if (isNextRouterError(reason)) {
    ev.preventDefault()
    return
  }

  let error = reason
  if (error && !isError(error)) {
    error = createUnhandledError(error + '')
  }

  rejectionQueue.push(error)
  for (const handler of rejectionHandlers) {
    handler(error)
  }
}

export function handleGlobalErrors() {
  if (typeof window !== 'undefined') {
    try {
      // Increase the number of stack frames on the client
      Error.stackTraceLimit = 50
    } catch {}

    window.addEventListener('error', onUnhandledError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
  }
}
