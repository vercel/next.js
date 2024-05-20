import { isRedirectError } from './redirect'
import { matchUIError } from '../../shared/lib/ui-error-types'

export function isNextRouterError(error: any): boolean {
  return (
    error && error.digest && (isRedirectError(error) || !!matchUIError(error))
  )
}
