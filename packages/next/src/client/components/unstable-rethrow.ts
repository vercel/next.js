import { isHangingPromiseRejectionError } from '../../server/dynamic-rendering-utils'
import { isPostpone } from '../../server/lib/router-utils/is-postpone'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNextRouterError } from './is-next-router-error'
import {
  isDynamicPostpone,
  isPrerenderInterruptedError,
} from '../../server/app-render/dynamic-rendering'
import { isDynamicServerError } from './hooks-server-context'

/**
 * This function should be used to rethrow internal Next.js errors so that they can be handled by the framework.
 * When wrapping an API that uses errors to interrupt control flow, you should use this function before you do any error handling.
 * This function will rethrow the error if it is a Next.js error so it can be handled, otherwise it will do nothing.
 *
 * In the browser bundle this module is aliased to `./unstable-rethrow.browser`, which performs a
 * subset of these checks (the server-only ones can never occur in the browser). This default
 * module holds the full server logic and is used on every server runtime (Node, edge) and in any
 * context where the alias does not apply.
 *
 * Read more: [Next.js Docs: `unstable_rethrow`](https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow)
 */
export function unstable_rethrow(error: unknown): void {
  if (
    isNextRouterError(error) ||
    isBailoutToCSRError(error) ||
    isDynamicServerError(error) ||
    isDynamicPostpone(error) ||
    isPostpone(error) ||
    isHangingPromiseRejectionError(error) ||
    isPrerenderInterruptedError(error)
  ) {
    throw error
  }

  if (error instanceof Error && 'cause' in error) {
    unstable_rethrow(error.cause)
  }
}
