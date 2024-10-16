import { isNextRouterError } from '../is-next-router-error'
import { handleClientError } from '../react-dev-overlay/internal/helpers/use-error-handler'

export const originConsoleError = window.console.error

// Patch console.error to collect information about hydration errors
export function patchConsoleError() {
  // Ensure it's only patched once
  if (typeof window === 'undefined') {
    return
  }

  window.console.error = (...args) => {
    // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
    const errorIndex = process.env.NODE_ENV !== 'production' ? 1 : 0
    const error = args[errorIndex]

    if (!isNextRouterError(error)) {
      if (process.env.NODE_ENV !== 'production') {
        const { storeHydrationErrorStateFromConsoleArgs } =
          require('../react-dev-overlay/internal/helpers/hydration-error-info') as typeof import('../react-dev-overlay/internal/helpers/hydration-error-info')

        storeHydrationErrorStateFromConsoleArgs(...args)
        handleClientError(error)
      }

      originConsoleError.apply(window.console, args)
    }
  }
}
