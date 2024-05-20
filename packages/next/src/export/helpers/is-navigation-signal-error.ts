import { isRedirectError } from '../../client/components/redirect'
import { matchUIError } from '../../shared/lib/ui-error-types'

/**
 * Returns true if the error is a navigation signal error. These errors are
 * thrown by user code to perform navigation operations and interrupt the React
 * render.
 */
export const isNavigationSignalError = (err: unknown) =>
  isRedirectError(err) || !!matchUIError(err)
