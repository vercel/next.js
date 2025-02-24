// This file is only used in app router due to the specific error state handling.

import type { ErrorInfo } from 'react'
import { getReactStitchedError } from '../components/errors/stitched-error'
import { handleClientError } from '../components/errors/use-error-handler'
import { isNextRouterError } from '../components/is-next-router-error'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { reportGlobalError } from './report-global-error'
import { originConsoleError } from '../components/globals/intercept-console-error'
import { AppDevOverlayErrorBoundary } from '../components/react-dev-overlay/app/app-dev-overlay-error-boundary'
import {
  ErrorBoundaryHandler,
  GlobalError as DefaultErrorBoundary,
} from '../components/error-boundary'

export function onCaughtError(
  err: unknown,
  errorInfo: ErrorInfo & { errorBoundary?: React.Component }
) {
  const errorBoundaryComponent = errorInfo.errorBoundary?.constructor

  const isImplicitErrorBoundary =
    (process.env.NODE_ENV !== 'production' &&
      errorBoundaryComponent === AppDevOverlayErrorBoundary) ||
    (errorBoundaryComponent === ErrorBoundaryHandler &&
      (errorInfo.errorBoundary! as InstanceType<typeof ErrorBoundaryHandler>)
        .props.errorComponent === DefaultErrorBoundary)
  if (isImplicitErrorBoundary) {
    // We don't consider errors caught unless they're caught by an explicit error
    // boundary. The built-in ones are considered implicit.
    // This mimics how the same app would behave without Next.js.
    return onUncaughtError(err, errorInfo)
  }

  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(err) || isNextRouterError(err)) return

  if (process.env.NODE_ENV !== 'production') {
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

export function onUncaughtError(err: unknown, errorInfo: React.ErrorInfo) {
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(err) || isNextRouterError(err)) return

  if (process.env.NODE_ENV !== 'production') {
    const stitchedError = getReactStitchedError(err)
    // TODO: change to passing down errorInfo later
    // In development mode, pass along the component stack to the error
    if (errorInfo.componentStack) {
      ;(stitchedError as any)._componentStack = errorInfo.componentStack
    }

    // TODO: Add an adendum to the overlay telling people about custom error boundaries.
    reportGlobalError(stitchedError)
  } else {
    reportGlobalError(err)
  }
}
