import { isNextRouterError } from '../is-next-router-error'

const originConsoleError = window.console.error

// Patch console.error to collect information about hydration errors
export function patchConsoleError(
  onClientErrorCallback: (error: unknown, consoleArgs: unknown[]) => void
) {
  // Ensure it's only patched once
  if (typeof window === 'undefined') {
    return
  }

  window.console.error = (...args: any[]) => {
    // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
    const error = process.env.NODE_ENV !== 'production' ? args[1] : args[0]

    if (!isNextRouterError(error)) {
      if (process.env.NODE_ENV !== 'production') {
        onClientErrorCallback(error, args)
      }

      originConsoleError.apply(window.console, args)
    }
  }
}

export function unpatchConsoleError() {
  if (typeof window === 'undefined') {
    return
  }

  window.console.error = originConsoleError
}
