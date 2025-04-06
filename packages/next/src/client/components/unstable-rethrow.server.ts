import { isHangingPromiseRejectionError } from '../../server/dynamic-rendering-utils'
import { isPostpone } from '../../server/lib/router-utils/is-postpone'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNextRouterError } from './is-next-router-error'
import { isDynamicPostpone } from '../../server/app-render/dynamic-rendering'
import { isDynamicServerError } from './hooks-server-context'

export function unstable_rethrow(error: unknown): void {
  if (
    isNextRouterError(error) ||
    isBailoutToCSRError(error) ||
    isDynamicServerError(error) ||
    isDynamicPostpone(error) ||
    isPostpone(error) ||
    isHangingPromiseRejectionError(error)
  ) {
    throw error
  }

  if (error instanceof Error && 'cause' in error) {
    unstable_rethrow(error.cause)
  }
}
