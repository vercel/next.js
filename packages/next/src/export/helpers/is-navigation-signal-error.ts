import { isNotFoundError } from '../../client/components/not-found'
import { isRedirectError } from '../../client/components/redirect'
import { isForbiddenError } from '../../client/components/forbidden'

/**
 * Returns true if the error is a navigation signal error. These errors are
 * thrown by user code to perform navigation operations and interrupt the React
 * render.
 */
export const isNavigationSignalError = (err: unknown) =>
  isNotFoundError(err) || isRedirectError(err) || isForbiddenError(err)
