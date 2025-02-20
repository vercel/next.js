// This file is only used in app router due to the specific error state handling.

import type { HydrationOptions } from 'react-dom/client'
import { getReactStitchedError } from '../components/errors/stitched-error'
import { handleClientError } from '../components/errors/use-error-handler'
import { isNextRouterError } from '../components/is-next-router-error'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { reportGlobalError } from './report-global-error'
import { originConsoleError } from '../components/globals/intercept-console-error'

export const onCaughtError: HydrationOptions['onCaughtError'] = (
  err,
  errorInfo
) => {
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(err) || isNextRouterError(err)) return

  if (process.env.NODE_ENV !== 'production') {
    const errorBoundaryComponent = errorInfo?.errorBoundary?.constructor
    const errorBoundaryName =
      // read react component displayName
      (errorBoundaryComponent as any)?.displayName ||
      errorBoundaryComponent?.name ||
      'Unknown'

    const componentThatErroredFrame = errorInfo?.componentStack?.split('\n')[1]

    // Match chrome or safari stack trace
    const matches =
      // regex to match the function name in the stack trace
      // example 1: at Page (http://localhost:3000/_next/static/chunks/pages/index.js?ts=1631600000000:2:1)
      // example 2: Page@http://localhost:3000/_next/static/chunks/pages/index.js?ts=1631600000000:2:1
      componentThatErroredFrame?.match(/\s+at (\w+)\s+|(\w+)@/) ?? []
    const componentThatErroredName = matches[1] || matches[2] || 'Unknown'

    // Create error location with errored component and error boundary, to match the behavior of default React onCaughtError handler.
    const errorBoundaryMessage = `It was handled by the <${errorBoundaryName}> error boundary.`
    const componentErrorMessage = componentThatErroredName
      ? `The above error occurred in the <${componentThatErroredName}> component.`
      : `The above error occurred in one of your components.`

    const errorLocation = `${componentErrorMessage} ${errorBoundaryMessage}`

    const stitchedError = getReactStitchedError(err)
    // TODO: change to passing down errorInfo later
    // In development mode, pass along the component stack to the error
    if (errorInfo.componentStack) {
      ;(stitchedError as any)._componentStack = errorInfo.componentStack
    }

    // Log and report the error with location but without modifying the error stack
    originConsoleError('%o\n\n%s', err, errorLocation)

    handleClientError(stitchedError, [])
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

  if (process.env.NODE_ENV !== 'production') {
    const componentThatErroredFrame = errorInfo?.componentStack?.split('\n')[1]

    // Match chrome or safari stack trace
    const matches =
      componentThatErroredFrame?.match(/\s+at (\w+)\s+|(\w+)@/) ?? []
    const componentThatErroredName = matches[1] || matches[2] || 'Unknown'

    // Create error location with errored component and error boundary, to match the behavior of default React onCaughtError handler.
    const errorLocation = componentThatErroredName
      ? `The above error occurred in the <${componentThatErroredName}> component.`
      : `The above error occurred in one of your components.`

    const stitchedError = getReactStitchedError(err)
    // TODO: change to passing down errorInfo later
    // In development mode, pass along the component stack to the error
    if (errorInfo.componentStack) {
      ;(stitchedError as any)._componentStack = errorInfo.componentStack
    }

    // Log and report the error with location but without modifying the error stack
    originConsoleError('%o\n\n%s', err, errorLocation)
    reportGlobalError(stitchedError)
  } else {
    reportGlobalError(err)
  }
}
