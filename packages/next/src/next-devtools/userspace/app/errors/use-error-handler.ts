import { useEffect } from 'react'
import { isNextRouterError } from '../../../../client/components/is-next-router-error'
import {
  formatConsoleArgs,
  parseConsoleArgs,
} from '../../../../client/lib/console'
import isError from '../../../../lib/is-error'
import { createConsoleError } from '../../../shared/console-error'
import { coerceError, setOwnerStackIfAvailable } from './stitched-error'
import { forwardUnhandledError, logUnhandledRejection } from '../forward-logs'

const queueMicroTask =
  globalThis.queueMicrotask || ((cb: () => void) => Promise.resolve().then(cb))

type ErrorHandler = (error: Error) => void

const errorQueue: Array<Error> = []
const errorHandlers: Array<ErrorHandler> = []
const rejectionQueue: Array<Error> = []
const rejectionHandlers: Array<ErrorHandler> = []

export function handleConsoleError(
  originError: unknown,
  consoleErrorArgs: any[]
) {
  let error: Error
  const { environmentName } = parseConsoleArgs(consoleErrorArgs)
  if (isError(originError)) {
    error = createConsoleError(originError, environmentName)
  } else {
    error = createConsoleError(
      formatConsoleArgs(consoleErrorArgs),
      environmentName
    )
  }
  setOwnerStackIfAvailable(error)

  errorQueue.push(error)
  for (const handler of errorHandlers) {
    // Delayed the error being passed to React Dev Overlay,
    // avoid the state being synchronously updated in the component.
    queueMicroTask(() => {
      handler(error)
    })
  }
}

export function handleClientError(error: Error) {
  errorQueue.push(error)
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
  const thrownValue: unknown = event.error
  if (isNextRouterError(thrownValue)) {
    event.preventDefault()
    return false
  }
  // When there's an error property present, we log the error to error overlay.
  // Otherwise we don't do anything as it's not logging in the console either.
  if (thrownValue) {
    const error = coerceError(thrownValue)
    setOwnerStackIfAvailable(error)
    handleClientError(error)
    forwardUnhandledError(error)
  }
}

function onUnhandledRejection(ev: WindowEventMap['unhandledrejection']): void {
  const reason: unknown = ev?.reason
  if (isNextRouterError(reason)) {
    ev.preventDefault()
    return
  }

  const error = coerceError(reason)
  setOwnerStackIfAvailable(error)

  rejectionQueue.push(error)
  for (const handler of rejectionHandlers) {
    handler(error)
  }

  logUnhandledRejection(reason)
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
