// This file is only used in app router due to the specific error state handling.

import type { ErrorInfo } from 'react'
import { isNextRouterError } from '../components/is-next-router-error'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { reportGlobalError } from './report-global-error'
import { ErrorBoundaryHandler } from '../components/error-boundary'
import DefaultErrorBoundary from '../components/builtin/global-error'
import type { RuntimeErrorBoundary } from '../../server/dev/hot-reloader-types'

const devToolErrorMod: typeof import('../../next-devtools/userspace/app/errors') =
  process.env.NODE_ENV !== 'production'
    ? (require('../../next-devtools/userspace/app/errors') as typeof import('../../next-devtools/userspace/app/errors'))
    : {
        decorateDevError: (error: unknown) => error as Error,
        handleClientError: () => {},
        originConsoleError: console.error.bind(console),
      }

export function onCaughtError(
  thrownValue: unknown,
  errorInfo: ErrorInfo & { errorBoundary?: React.Component }
) {
  const errorBoundaryComponent = errorInfo.errorBoundary?.constructor

  let isImplicitErrorBoundary
  let boundary: RuntimeErrorBoundary | undefined

  if (process.env.NODE_ENV !== 'production') {
    const { AppDevOverlayErrorBoundary } =
      require('../../next-devtools/userspace/app/app-dev-overlay-error-boundary') as typeof import('../../next-devtools/userspace/app/app-dev-overlay-error-boundary')

    isImplicitErrorBoundary =
      errorBoundaryComponent === AppDevOverlayErrorBoundary

    if (
      process.env.__NEXT_EXPOSE_RUNTIME_ERRORS_TO_HMR &&
      errorInfo.errorBoundary
    ) {
      let component: any = errorBoundaryComponent
      let kind: 'default-global' | 'custom-global' | 'custom' = 'custom'
      if (errorBoundaryComponent === AppDevOverlayErrorBoundary) {
        component = (
          errorInfo.errorBoundary as InstanceType<
            typeof AppDevOverlayErrorBoundary
          >
        ).props.globalError[0]
        kind =
          component === DefaultErrorBoundary
            ? 'default-global'
            : 'custom-global'
      } else if (errorBoundaryComponent === ErrorBoundaryHandler) {
        component = (
          errorInfo.errorBoundary as InstanceType<typeof ErrorBoundaryHandler>
        ).props.errorComponent
        kind = component === DefaultErrorBoundary ? 'default-global' : 'custom'
      }
      const name = component?.displayName || component?.name
      boundary = { kind, ...(typeof name === 'string' && name ? { name } : {}) }
    }
  }

  isImplicitErrorBoundary =
    isImplicitErrorBoundary ||
    (errorBoundaryComponent === ErrorBoundaryHandler &&
      (errorInfo.errorBoundary! as InstanceType<typeof ErrorBoundaryHandler>)
        .props.errorComponent === DefaultErrorBoundary)

  // Skip the segment explorer triggered error
  if (process.env.NODE_ENV !== 'production') {
    const { SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE } =
      require('../../next-devtools/userspace/app/segment-explorer-node') as typeof import('../../next-devtools/userspace/app/segment-explorer-node')
    if (
      thrownValue instanceof Error &&
      thrownValue.message === SEGMENT_EXPLORER_SIMULATED_ERROR_MESSAGE
    ) {
      return
    }
  }

  if (isImplicitErrorBoundary) {
    // We don't consider errors caught unless they're caught by an explicit error
    // boundary. The built-in ones are considered implicit.
    // This mimics how the same app would behave without Next.js.
    return reportUncaughtError(thrownValue, boundary)
  }

  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(thrownValue) || isNextRouterError(thrownValue)) return

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
    const error = devToolErrorMod.decorateDevError(thrownValue)

    // Log and report the error with location but without modifying the error stack
    devToolErrorMod.originConsoleError('%o\n\n%s', thrownValue, errorLocation)

    if (process.env.__NEXT_EXPOSE_RUNTIME_ERRORS_TO_HMR) {
      devToolErrorMod.handleClientError(error, { fatal: false, boundary })
    } else {
      devToolErrorMod.handleClientError(error)
    }
  } else {
    devToolErrorMod.originConsoleError(thrownValue)
  }
}

export function onUncaughtError(thrownValue: unknown) {
  reportUncaughtError(thrownValue)
}

function reportUncaughtError(
  thrownValue: unknown,
  boundary: RuntimeErrorBoundary | undefined = undefined
) {
  // Skip certain custom errors which are not expected to be reported on client
  if (isBailoutToCSRError(thrownValue) || isNextRouterError(thrownValue)) return

  if (process.env.NODE_ENV !== 'production') {
    const error = devToolErrorMod.decorateDevError(thrownValue)
    if (process.env.__NEXT_EXPOSE_RUNTIME_ERRORS_TO_HMR) {
      const { setRuntimeErrorMetadata } =
        require('../../next-devtools/userspace/app/errors/runtime-error-metadata') as typeof import('../../next-devtools/userspace/app/errors/runtime-error-metadata')
      setRuntimeErrorMetadata(error, { fatal: true, boundary })
    }

    // TODO: Add an adendum to the overlay telling people about custom error boundaries.
    reportGlobalError(error)
  } else {
    reportGlobalError(thrownValue)
  }
}
