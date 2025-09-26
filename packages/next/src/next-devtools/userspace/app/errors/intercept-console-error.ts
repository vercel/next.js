import isError from '../../../../lib/is-error'
import { isNextRouterError } from '../../../../client/components/is-next-router-error'
import { handleConsoleError } from './use-error-handler'
import { parseConsoleArgs } from '../../../../client/lib/console'
import { forwardErrorLog } from '../forward-logs'

export const originConsoleError = globalThis.console.error

// Patch console.error to collect information about hydration errors
export function patchConsoleError() {
  // Ensure it's only patched once
  if (typeof window === 'undefined') {
    return
  }
  window.console.error = function error(...args: any[]) {
    let maybeError: unknown
    if (process.env.NODE_ENV !== 'production') {
      const { error: replayedError } = parseConsoleArgs(args)
      if (replayedError) {
        maybeError = replayedError
      } else if (isError(args[0])) {
        maybeError = args[0]
      } else {
        // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
        maybeError = args[1]
      }
    } else {
      maybeError = args[0]
    }

    if (!isNextRouterError(maybeError)) {
      if (process.env.NODE_ENV !== 'production') {
        handleConsoleError(
          // replayed errors have their own complex format string that should be used,
          // but if we pass the error directly, `handleClientError` will ignore it
          maybeError,
          args
        )
      }
      forwardErrorLog(args)

      originConsoleError.apply(window.console, args)
    }
  }
}
