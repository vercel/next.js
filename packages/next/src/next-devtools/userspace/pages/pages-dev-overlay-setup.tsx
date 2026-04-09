import React from 'react'
import { renderPagesDevOverlay } from 'next/dist/compiled/next-devtools'
import { dispatcher } from 'next/dist/compiled/next-devtools'
import {
  attachHydrationErrorState,
  storeHydrationErrorStateFromConsoleArgs,
} from './hydration-error-state'
import { Router } from '../../../client/router'
import { getOwnerStack } from '../app/errors/stitched-error'
import { isRecoverableError } from '../../../client/react-client-callbacks/on-recoverable-error'
import { getSquashedHydrationErrorDetails } from './hydration-error-state'
import { PagesDevOverlayErrorBoundary } from './pages-dev-overlay-error-boundary'
import {
  initializeDebugLogForwarding,
  forwardUnhandledError,
  logUnhandledRejection,
  forwardErrorLog,
} from '../app/forward-logs'

const usePagesDevOverlayBridge = () => {
  React.useInsertionEffect(() => {
    // NDT uses a different React instance so it's not technically a state update
    // scheduled from useInsertionEffect.
    renderPagesDevOverlay(
      getOwnerStack,
      getSquashedHydrationErrorDetails,
      isRecoverableError
    )
  }, [])

  React.useEffect(() => {
    const { handleStaticIndicator } =
      require('../../../client/dev/hot-reloader/pages/hot-reloader-pages') as typeof import('../../../client/dev/hot-reloader/pages/hot-reloader-pages')

    Router.events.on('routeChangeComplete', handleStaticIndicator)

    return function () {
      Router.events.off('routeChangeComplete', handleStaticIndicator)
    }
  }, [])
}

export type PagesDevOverlayBridgeType = typeof PagesDevOverlayBridge

interface PagesDevOverlayBridgeProps {
  children?: React.ReactNode
}

export function PagesDevOverlayBridge({
  children,
}: PagesDevOverlayBridgeProps) {
  usePagesDevOverlayBridge()

  return <PagesDevOverlayErrorBoundary>{children}</PagesDevOverlayErrorBoundary>
}

let isRegistered = false

function handleError(error: unknown) {
  if (!error || !(error instanceof Error) || typeof error.stack !== 'string') {
    // A non-error was thrown, we don't have anything to show. :-(
    return
  }

  attachHydrationErrorState(error)

  // Skip ModuleBuildError and ModuleNotFoundError, as it will be sent through onBuildError callback.
  // This is to avoid same error as different type showing up on client to cause flashing.
  if (
    error.name !== 'ModuleBuildError' &&
    error.name !== 'ModuleNotFoundError'
  ) {
    dispatcher.onUnhandledError(error)
  }
}

let origConsoleError = console.error
function nextJsHandleConsoleError(...args: any[]) {
  // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
  const maybeError = process.env.NODE_ENV !== 'production' ? args[1] : args[0]
  storeHydrationErrorStateFromConsoleArgs(...args)
  // TODO: Surfaces non-errors logged via `console.error`.
  handleError(maybeError)
  forwardErrorLog(args)
  origConsoleError.apply(window.console, args)
}

function onUnhandledError(event: ErrorEvent) {
  const error = event?.error
  handleError(error)

  if (error) {
    forwardUnhandledError(error as Error)
  }
}

function onUnhandledRejection(ev: PromiseRejectionEvent) {
  const reason = ev?.reason
  if (
    !reason ||
    !(reason instanceof Error) ||
    typeof reason.stack !== 'string'
  ) {
    // A non-error was thrown, we don't have anything to show. :-(
    return
  }

  dispatcher.onUnhandledRejection(reason)
  logUnhandledRejection(reason)
}

export function register() {
  if (isRegistered) {
    return
  }
  isRegistered = true

  try {
    Error.stackTraceLimit = 50
  } catch {}

  initializeDebugLogForwarding('pages')
  window.addEventListener('error', onUnhandledError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  window.console.error = nextJsHandleConsoleError
}
