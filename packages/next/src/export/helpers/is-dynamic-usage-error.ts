import { isDynamicServerError } from '../../client/components/hooks-server-context'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNextRouterError } from '../../client/components/is-next-router-error'
import { isDynamicPostpone } from '../../server/app-render/dynamic-rendering'

export const isDynamicUsageError = (err: unknown) =>
  isDynamicServerError(err) ||
  isBailoutToCSRError(err) ||
  isNextRouterError(err) ||
  isDynamicPostpone(err)
