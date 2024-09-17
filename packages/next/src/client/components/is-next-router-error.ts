import { isNotFoundError } from './not-found'
import { isRedirectError } from './redirect'

/**
 * Returns true if the error is a navigation signal error. These errors are
 * thrown by user code to perform navigation operations and interrupt the React
 * render.
 */
export function isNextRouterError(error: any): boolean {
  return isRedirectError(error) || isNotFoundError(error)
}
