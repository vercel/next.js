import { isDynamicServerError } from '../../client/components/hooks-server-context'
import { isNotFoundError } from '../../client/components/not-found'
import { isRedirectError } from '../../client/components/redirect'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'

export const isDynamicUsageError = (err: unknown) =>
  isDynamicServerError(err) ||
  isBailoutToCSRError(err) ||
  isNotFoundError(err) ||
  isRedirectError(err)
