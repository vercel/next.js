import { useCallback, useEffect } from 'react'
import { attachHydrationErrorState } from './attach-hydration-error-state'
import { isNextRouterError } from '../is-next-router-error'
import { storeHydrationErrorStateFromConsoleArgs } from './hydration-error-info'
import { formatConsoleArgs, parseConsoleArgs } from '../../lib/console'
import isError from '../../../lib/is-error'
import { createConsoleError } from './console-error'
import { enqueueConsecutiveDedupedError } from './enqueue-client-error'
import { getReactStitchedError } from '../errors/stitched-error'
import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  type useErrorOverlayReducer,
} from '../react-dev-overlay/shared'
import { parseStack } from '../react-dev-overlay/utils/parse-stack'
import { parseComponentStack } from '../react-dev-overlay/utils/parse-component-stack'

const queueMicroTask =
  globalThis.queueMicrotask || ((cb: () => void) => Promise.resolve().then(cb))

export type ErrorHandler = (error: Error) => void

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

export function handleClientError(originError: unknown) {
  let error: Error
  if (isError(originError)) {
    error = originError
  } else {
    // If it's not an error, format the args into an error
    const formattedErrorMessage = originError + ''
    error = new Error(formattedErrorMessage)
  }
  error = getReactStitchedError(error)

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

export function useErrorHandlers(
  dispatch: ReturnType<typeof useErrorOverlayReducer>[1]
): void {
  const handleOnUnhandledError = useCallback(
    (error: Error): void => {
      // Component stack is added to the error in use-error-handler in case there was a hydration error
      const componentStackTrace = (error as any)._componentStack

      dispatch({
        type: ACTION_UNHANDLED_ERROR,
        reason: error,
        frames: parseStack(error.stack || ''),
        componentStackFrames:
          typeof componentStackTrace === 'string'
            ? parseComponentStack(componentStackTrace)
            : undefined,
      })
    },
    [dispatch]
  )

  const handleOnUnhandledRejection = useCallback(
    (reason: Error): void => {
      const stitchedError = getReactStitchedError(reason)
      dispatch({
        type: ACTION_UNHANDLED_REJECTION,
        reason: stitchedError,
        frames: parseStack(stitchedError.stack || ''),
      })
    },
    [dispatch]
  )
  useErrorHandler(handleOnUnhandledError, handleOnUnhandledRejection)
}

function useErrorHandler(
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
    handleClientError(event.error)
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
    error = new Error(error + '')
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
