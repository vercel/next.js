import { isNotFoundError } from '../../client/components/not-found'
import { isRedirectError } from '../../client/components/redirect'

/**
 * Returns true if the error is a navigation signal error. These errors are
 * thrown by user code to perform navigation operations and interrupt the React
 * render.
 */
export const isNavigationSignalError = (err: unknown) =>
  isNotFoundError(err) || isRedirectError(err)
