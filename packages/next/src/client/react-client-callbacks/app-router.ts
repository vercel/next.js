// This file is only used in app router due to the specific error state handling.

import type { HydrationOptions } from 'react-dom/client'
import { getReactStitchedError } from '../components/react-dev-overlay/internal/helpers/stitched-error'
import { handleClientError } from '../components/react-dev-overlay/internal/helpers/use-error-handler'
import { isNextRouterError } from '../components/is-next-router-error'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { reportGlobalError } from './report-global-error'
import isError from '../../lib/is-error'
import { originConsoleError } from '../components/globals/intercept-console-error'

export const onCaughtError: HydrationOptions['onCaughtError'] = (
  err,
  errorInfo
) => {
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(err) || isNextRouterError(err)) return

  const stitchedError = getReactStitchedError(err)

  if (process.env.NODE_ENV === 'development') {
    const errorBoundaryComponent = errorInfo?.errorBoundary?.constructor
    const errorBoundaryName =
      // read react component displayName
      (errorBoundaryComponent as any)?.displayName ||
      errorBoundaryComponent?.name ||
      'Unknown'

    const componentThatErroredFrame = errorInfo?.componentStack?.split('\n')[1]

    // Match chrome or safari stack trace
    const matches =
      componentThatErroredFrame?.match(/\s+at (\w+)\s+|(\w+)@/) ?? []
    const componentThatErroredName = matches[1] || matches[2] || 'Unknown'

    // In development mode, pass along the component stack to the error
    if (process.env.NODE_ENV === 'development' && errorInfo.componentStack) {
      ;(stitchedError as any)._componentStack = errorInfo.componentStack
    }

    // Create error location with errored component and error boundary, to match the behavior of default React onCaughtError handler.
    const errorLocation = `The above error occurred in the <${componentThatErroredName}> component. It was handled by the <${errorBoundaryName}> error boundary.`

    const originErrorStack = isError(err) ? err.stack || '' : ''

    // Always log the modified error instance so the console.error interception side can pick it up easily without constructing an error again.
    originConsoleError(originErrorStack + '\n\n' + errorLocation)
    handleClientError(stitchedError)
  } else {
    originConsoleError(err)
  }
}

export const onUncaughtError: HydrationOptions['onUncaughtError'] = (
  err,
  errorInfo
) => {
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(err) || isNextRouterError(err)) return

  const stitchedError = getReactStitchedError(err)

  if (process.env.NODE_ENV === 'development') {
    const componentThatErroredFrame = errorInfo?.componentStack?.split('\n')[1]

    // Match chrome or safari stack trace
    const matches =
      componentThatErroredFrame?.match(/\s+at (\w+)\s+|(\w+)@/) ?? []
    const componentThatErroredName = matches[1] || matches[2] || 'Unknown'

    // In development mode, pass along the component stack to the error
    if (process.env.NODE_ENV === 'development' && errorInfo.componentStack) {
      ;(stitchedError as any)._componentStack = errorInfo.componentStack
    }

    // Create error location with errored component and error boundary, to match the behavior of default React onCaughtError handler.
    const errorLocation = `The above error occurred in the <${componentThatErroredName}> component.`

    originConsoleError(stitchedError.stack + '\n\n' + errorLocation)
    // Always log the modified error instance so the console.error interception side can pick it up easily without constructing an error again.
    reportGlobalError(stitchedError)
  } else {
    reportGlobalError(err)
  }
}
