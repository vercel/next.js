import { isNotFoundError } from './not-found'
import { isRedirectError } from './redirect'

export function isNextRouterError(error: unknown): boolean {
  return isRedirectError(error) || isNotFoundError(error)
}
