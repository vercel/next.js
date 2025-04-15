// This module can be shared between both pages router and app router

import type { HydrationOptions } from 'react-dom/client'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import {
  setOwnerStackIfAvailable,
  setComponentStack,
  coerceError,
} from '../components/errors/stitched-error'
import isError from '../../lib/is-error'
import { reportGlobalError } from './report-global-error'

export const onRecoverableError: HydrationOptions['onRecoverableError'] = (
  error,
  errorInfo
) => {
  // x-ref: https://github.com/facebook/react/pull/28736
  const cause = isError(error) && 'cause' in error ? error.cause : error
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(cause)) return

  const causeError = coerceError(cause)
  setOwnerStackIfAvailable(causeError)

  if (process.env.NODE_ENV === 'development' && errorInfo.componentStack) {
    setComponentStack(causeError, errorInfo.componentStack)
  }

  reportGlobalError(causeError)
}
