import isError from '../../../lib/is-error'
import { isNextRouterError } from '../is-next-router-error'
import { handleClientError } from '../errors/use-error-handler'

export const originConsoleError = window.console.error

// Patch console.error to collect information about hydration errors
export function patchConsoleError() {
  // Ensure it's only patched once
  if (typeof window === 'undefined') {
    return
  }
  window.console.error = function error(...args: any[]) {
    let maybeError: unknown
    if (process.env.NODE_ENV !== 'production') {
      const replayedError = matchReplayedError(...args)
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
        handleClientError(
          // replayed errors have their own complex format string that should be used,
          // but if we pass the error directly, `handleClientError` will ignore it
          maybeError,
          args,
          true
        )
      }

      originConsoleError.apply(window.console, args)
    }
  }
}

function matchReplayedError(...args: unknown[]): Error | null {
  // See
  // https://github.com/facebook/react/blob/65a56d0e99261481c721334a3ec4561d173594cd/packages/react-devtools-shared/src/backend/flight/renderer.js#L88-L93
  //
  // Logs replayed from the server look like this:
  // [
  //   "%c%s%c %o\n\n%s\n\n%s\n",
  //   "background: #e6e6e6; ...",
  //   " Server ", // can also be e.g. " Prerender "
  //   "",
  //   Error
  //   "The above error occurred in the <Page> component."
  //   ...
  // ]
  if (
    args.length > 3 &&
    typeof args[0] === 'string' &&
    args[0].startsWith('%c%s%c ') &&
    typeof args[1] === 'string' &&
    typeof args[2] === 'string' &&
    typeof args[3] === 'string'
  ) {
    const maybeError = args[4]
    if (isError(maybeError)) {
      return maybeError
    }
  }

  return null
}
