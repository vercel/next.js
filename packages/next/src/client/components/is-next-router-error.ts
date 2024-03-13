import { isNotFoundError } from './not-found'
import { isRedirectError } from './redirect'
import { isForbiddenError } from './forbidden'

export function isNextRouterError(error: any): boolean {
  return (
    error &&
    error.digest &&
    (isRedirectError(error) ||
      isNotFoundError(error) ||
      isForbiddenError(error))
  )
}
