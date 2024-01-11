import { DYNAMIC_ERROR_CODE } from '../../client/components/hooks-server-context'
import { isNotFoundError } from '../../client/components/not-found'
import { isRedirectError } from '../../client/components/redirect'

export const isDynamicUsageError = (err: any) =>
  err.digest === DYNAMIC_ERROR_CODE ||
  isNotFoundError(err) ||
  isRedirectError(err)
