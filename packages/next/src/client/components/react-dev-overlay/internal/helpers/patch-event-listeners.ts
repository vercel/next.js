import {
  handleClientError,
  rejectionQueue,
  rejectionHandlers,
} from './use-error-handler'

import { isNextRouterError } from '../../../is-next-router-error'

let isPatched = false
function patchEventListeners() {
  if (typeof window !== 'undefined') {
    // Ensure it's only patched once
    if (isPatched) return
    isPatched = true

    try {
      // Increase the number of stack frames on the client
      Error.stackTraceLimit = 50
    } catch {}

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
        if (isNextRouterError(reason)) {
          ev.preventDefault()
          return
        }

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
}

patchEventListeners()
