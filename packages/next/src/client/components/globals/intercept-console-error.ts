import { isNextRouterError } from '../is-next-router-error'
import { handleClientError } from '../react-dev-overlay/internal/helpers/use-error-handler'

const originConsoleError = window.console.error

// Patch console.error to collect information about hydration errors
export function patchConsoleError() {
  // Ensure it's only patched once
  if (typeof window === 'undefined') {
    return
  }

  window.console.error = (...args: any[]) => {
    // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
    const error = process.env.NODE_ENV !== 'production' ? args[1] : args[0]

    if (!isNextRouterError(error)) {
      if (process.env.NODE_ENV !== 'production') {
        handleClientError(error, args)
      }

      originConsoleError.apply(window.console, args)
    }
  }
}
