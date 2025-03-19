// This module can be shared between both pages router and app router

import type { HydrationOptions } from 'react-dom/client'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import isError from '../../lib/is-error'

export const onRecoverableError: HydrationOptions['onRecoverableError'] = (
  error,
  errorInfo
) => {
  // x-ref: https://github.com/facebook/react/pull/28736
  const cause = isError(error) && 'cause' in error ? error.cause : error
  // In development mode, pass along the component stack to the error
  if (process.env.NODE_ENV === 'development' && errorInfo.componentStack) {
    ;(cause as any)._componentStack = errorInfo.componentStack
  }
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(cause)) return

  console.error(cause)
}
