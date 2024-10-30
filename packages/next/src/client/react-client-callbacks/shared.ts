// This module can be shared between both pages router and app router

import type { HydrationOptions } from 'react-dom/client'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { reportGlobalError } from './report-global-error'
import { getReactStitchedError } from '../components/react-dev-overlay/internal/helpers/stitched-error'

export const onRecoverableError: HydrationOptions['onRecoverableError'] = (
  err,
  errorInfo
) => {
  const stitchedError = getReactStitchedError(err)
  // In development mode, pass along the component stack to the error
  if (process.env.NODE_ENV === 'development' && errorInfo.componentStack) {
    ;(stitchedError as any)._componentStack = errorInfo.componentStack
  }
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(err)) return

  reportGlobalError(stitchedError)
}
