import { isDynamicServerError } from '../../client/components/hooks-server-context'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { isNavigationSignalError } from './is-navigation-signal-error'

export const isDynamicUsageError = (err: unknown) =>
  isDynamicServerError(err) ||
  isBailoutToCSRError(err) ||
  isNavigationSignalError(err)
