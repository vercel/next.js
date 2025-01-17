import { isDynamicUsageError } from '../../export/helpers/is-dynamic-usage-error'
import { isHangingPromiseRejectionError } from '../../server/dynamic-rendering-utils'
import { isPostpone } from '../../server/lib/router-utils/is-postpone'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNextRouterError } from './is-next-router-error'

/**
 * This function should be used to rethrow internal Next.js errors so that they can be handled by the framework.
 * When wrapping an API that uses errors to interrupt control flow, you should use this function before you do any error handling.
 * This function will rethrow the error if it is a Next.js error so it can be handled, otherwise it will do nothing.
 *
 * Read more: [Next.js Docs: `unstable_rethrow`](https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow)
 */
export function unstable_rethrow(error: unknown): void {
  if (
    isNextRouterError(error) ||
    isBailoutToCSRError(error) ||
    isDynamicUsageError(error) ||
    isPostpone(error) ||
    isHangingPromiseRejectionError(error)
  ) {
    throw error
  }

  if (error instanceof Error && 'cause' in error) {
    unstable_rethrow(error.cause)
  }
}
