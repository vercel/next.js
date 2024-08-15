import { isBailoutToCSRError } from '../shared/lib/lazy-dynamic/bailout-to-csr'

// x-ref: https://github.com/facebook/react/blob/d4bc16a7d69eb2ea38a88c8ac0b461d5f72cdcab/packages/react-dom/src/client/ReactDOMRoot.js#L83
const defaultOnRecoverableError =
  typeof reportError === 'function'
    ? // In modern browsers, reportError will dispatch an error event,
      // emulating an uncaught JavaScript error.
      reportError
    : (error: any) => {
        window.console.error(error)
      }

export function onRecoverableError(
  err: unknown,
  errorInfo: { componentStack?: string }
) {
  // In development mode, pass along the component stack to the error
  if (process.env.NODE_ENV === 'development' && errorInfo.componentStack) {
    ;(err as any)._componentStack = errorInfo.componentStack
  }
  // Using default react onRecoverableError

  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(err)) return

  defaultOnRecoverableError(err)
}
