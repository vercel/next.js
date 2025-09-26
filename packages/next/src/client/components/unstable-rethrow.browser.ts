import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNextRouterError } from './is-next-router-error'

export function unstable_rethrow(error: unknown): void {
  if (isNextRouterError(error) || isBailoutToCSRError(error)) {
    throw error
  }

  if (error instanceof Error && 'cause' in error) {
    unstable_rethrow(error.cause)
  }
}
