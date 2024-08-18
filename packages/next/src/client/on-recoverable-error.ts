import { NEXT_DYNAMIC_NO_SSR_CODE } from '../shared/lib/lazy-dynamic/no-ssr-error'

/**
 * @see [ReactInternalTypes]{@link https://github.com/facebook/react/blob/910045696bb5f693acb77890e6750c5e4659b420/packages/react-reconciler/src/ReactInternalTypes.js#L278-L281}
 */
interface ErrorInfo {
  componentStack?: string
}

export default function onRecoverableError(err: any, errorInfo?: ErrorInfo) {
  // Attach any component stack to the error, so it's accessible when passed thru `reportError` below,
  // such as from custom `window.onerror` or `window` `error` event listeners in an app.
  // Similar is done in `@next/react-dev-overlay`, but this supports production use cases as well.
  // This is technically a mutation of an argument, which is generally inadvisable, but probably not problematic in this case.
  // The alternative of constructing a new error could be more complicated.
  if (errorInfo?.componentStack) {
    err._componentStack = errorInfo.componentStack
  }

  // Using default react onRecoverableError
  // x-ref: https://github.com/facebook/react/blob/d4bc16a7d69eb2ea38a88c8ac0b461d5f72cdcab/packages/react-dom/src/client/ReactDOMRoot.js#L83
  const defaultOnRecoverableError =
    typeof reportError === 'function'
      ? // In modern browsers, reportError will dispatch an error event,
        // emulating an uncaught JavaScript error.
        reportError
      : (error: any, errorInfo: ErrorInfo) => {
          window.console.error(error, errorInfo)
        }

  // Skip certain custom errors which are not expected to be reported on client
  if (err.digest === NEXT_DYNAMIC_NO_SSR_CODE) return

  defaultOnRecoverableError(err, errorInfo)
}
