import { isNotFoundError, type NotFoundError } from './not-found'
import { isRedirectError, type RedirectError } from './redirect'

/**
 * Returns true if the error is a navigation signal error. These errors are
 * thrown by user code to perform navigation operations and interrupt the React
 * render.
 */
export function isNextRouterError(
  error: unknown
): error is RedirectError | NotFoundError {
  return isRedirectError(error) || isNotFoundError(error)
}
