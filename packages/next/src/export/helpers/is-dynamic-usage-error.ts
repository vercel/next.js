import { DYNAMIC_ERROR_CODE } from '../../client/components/hooks-server-context'
import { isNotFoundError } from '../../client/components/not-found'
import { isRedirectError } from '../../client/components/redirect'
import { isBailoutCSRError } from '../../shared/lib/lazy-dynamic/no-ssr-error'

export const isDynamicUsageError = (err: any) =>
  err.digest === DYNAMIC_ERROR_CODE ||
  isNotFoundError(err) ||
  isBailoutCSRError(err) ||
  isRedirectError(err)
