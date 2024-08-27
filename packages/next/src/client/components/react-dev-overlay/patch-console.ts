import { isNextRouterError } from '../is-next-router-error'
import { handleClientError } from './internal/helpers/use-error-handler'

let isPatched = false

const isReactOwnerStackEnabled = !!process.env.__NEXT_REACT_OWNER_STACK

// This original console.error is for logging the error stack that doesn't
// need to deal any specific logic with the error overlay.
const originConsoleError = window.console.error

// Patch console.error to collect information about hydration errors
function patchConsoleError() {
  // Ensure it's only patched once
  if (!isPatched) {
    isPatched = true

    window.console.error = (...args) => {
      // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
      const error =
        process.env.NODE_ENV !== 'production'
          ? isReactOwnerStackEnabled
            ? args[1] || args[0]
            : args[1]
          : args[0]

      if (!isNextRouterError(error)) {
        if (process.env.NODE_ENV !== 'production') {
          const { storeHydrationErrorStateFromConsoleArgs } =
            require('./internal/helpers/hydration-error-info') as typeof import('./internal/helpers/hydration-error-info')

          storeHydrationErrorStateFromConsoleArgs(...args)
          handleClientError(error)
        }

        originConsoleError.apply(window.console, args)
      }
    }
  }
}

export { patchConsoleError, originConsoleError }
