import { dispatcher } from 'next/dist/compiled/next-devtools'
import {
  attachHydrationErrorState,
  storeHydrationErrorStateFromConsoleArgs,
} from './hydration-error-state'
import type { VersionInfo } from '../../../../server/dev/parse-version-info'
import type { DevIndicatorServerState } from '../../../../server/dev/dev-indicator-server-state'

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
  origConsoleError.apply(window.console, args)
}

function onUnhandledError(event: ErrorEvent) {
  const error = event?.error
  handleError(error)
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
}

export function register() {
  if (isRegistered) {
    return
  }
  isRegistered = true

  try {
    Error.stackTraceLimit = 50
  } catch {}

  window.addEventListener('error', onUnhandledError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  window.console.error = nextJsHandleConsoleError
}

export function onBuildOk() {
  dispatcher.onBuildOk()
}

export function onBuildError(message: string) {
  dispatcher.onBuildError(message)
}

export function onRefresh() {
  dispatcher.onRefresh()
}

export function onBeforeRefresh() {
  dispatcher.onBeforeRefresh()
}

export function onVersionInfo(versionInfo: VersionInfo) {
  dispatcher.onVersionInfo(versionInfo)
}

export function onStaticIndicator(isStatic: boolean) {
  dispatcher.onStaticIndicator(isStatic)
}

export function onDevIndicator(devIndicatorsState: DevIndicatorServerState) {
  dispatcher.onDevIndicator(devIndicatorsState)
}

export function buildingIndicatorShow() {
  dispatcher.buildingIndicatorShow()
}

export function buildingIndicatorHide() {
  dispatcher.buildingIndicatorHide()
}

export { getErrorByType } from '../utils/get-error-by-type'
export { getServerError } from '../utils/node-stack-frames'
