import { isRedirectError } from './redirect'
import { matchUIError } from '../../shared/lib/ui-error-types'

/**
 * Returns true if the error is a navigation signal error. These errors are
 * thrown by user code to perform navigation operations and interrupt the React
 * render.
 */
export function isNextRouterError(error: any): boolean {
  return (
    error && error.digest && (isRedirectError(error) || !!matchUIError(error))
  )
}
