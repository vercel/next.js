import { isHangingPromiseRejectionError } from '../server/dynamic-rendering-utils'
import { isPostpone } from '../server/lib/router-utils/is-postpone'
import { isBailoutToCSRError } from '../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNextRouterError } from '../client/components/is-next-router-error'
import {
  isDynamicPostpone,
  isPrerenderInterruptedError,
} from '../server/app-render/dynamic-rendering'
import { isDynamicServerError } from '../client/components/hooks-server-context'

export function isNextInternalError(error: unknown): boolean {
  return (
    isNextRouterError(error) ||
    isBailoutToCSRError(error) ||
    isDynamicServerError(error) ||
    isDynamicPostpone(error) ||
    isPostpone(error) ||
    isHangingPromiseRejectionError(error) ||
    isPrerenderInterruptedError(error)
  )
}
