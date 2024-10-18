import * as Bus from './bus'
import { parseStack } from '../internal/helpers/parse-stack'
import { parseComponentStack } from '../internal/helpers/parse-component-stack'
import {
  hydrationErrorState,
  storeHydrationErrorStateFromConsoleArgs,
} from '../internal/helpers/hydration-error-info'
import {
  ACTION_BEFORE_REFRESH,
  ACTION_BUILD_ERROR,
  ACTION_BUILD_OK,
  ACTION_REFRESH,
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
  ACTION_VERSION_INFO,
} from '../shared'
import type { VersionInfo } from '../../../../server/dev/parse-version-info'
import { attachHydrationErrorState } from '../internal/helpers/attach-hydration-error-state'
import {
  patchConsoleError,
  unpatchConsoleError,
} from '../../globals/intercept-console-error'
import { ConsoleError } from '../internal/helpers/console-error'
import { formatConsoleArgs } from '../../../lib/console'
import isError from '../../../../lib/is-error'

let isRegistered = false
let stackTraceLimit: number | undefined = undefined

function handleClientError(originError: unknown, consoleErrorArgs: unknown[]) {
  let error: Error
  if (!originError || !isError(originError)) {
    // If it's not an error, format the args into an error
    const formattedErrorMessage = formatConsoleArgs(consoleErrorArgs)
    error = new ConsoleError(formattedErrorMessage)
  } else {
    error = originError
  }

  storeHydrationErrorStateFromConsoleArgs(...consoleErrorArgs)
  attachHydrationErrorState(error)

  const componentStackTrace =
    (error as any)._componentStack || hydrationErrorState.componentStack
  const componentStackFrames =
    typeof componentStackTrace === 'string'
      ? parseComponentStack(componentStackTrace)
      : undefined

  // Skip ModuleBuildError and ModuleNotFoundError, as it will be sent through onBuildError callback.
  // This is to avoid same error as different type showing up on client to cause flashing.
  if (
    error.name !== 'ModuleBuildError' &&
    error.name !== 'ModuleNotFoundError'
  ) {
    Bus.emit({
      type: ACTION_UNHANDLED_ERROR,
      reason: error,
      frames: parseStack(error.stack),
      componentStackFrames,
    })
  }
}

function onUnhandledError(event: ErrorEvent) {
  const error = event?.error
  handleClientError(error, [])
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

  const e = reason
  Bus.emit({
    type: ACTION_UNHANDLED_REJECTION,
    reason: reason,
    frames: parseStack(e.stack!),
  })
}

export function register() {
  if (isRegistered) {
    return
  }
  isRegistered = true

  try {
    const limit = Error.stackTraceLimit
    Error.stackTraceLimit = 50
    stackTraceLimit = limit
  } catch {}

  window.addEventListener('error', onUnhandledError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
  patchConsoleError(handleClientError)
}

export function unregister() {
  if (!isRegistered) {
    return
  }
  isRegistered = false

  if (stackTraceLimit !== undefined) {
    try {
      Error.stackTraceLimit = stackTraceLimit
    } catch {}
    stackTraceLimit = undefined
  }

  window.removeEventListener('error', onUnhandledError)
  window.removeEventListener('unhandledrejection', onUnhandledRejection)
  unpatchConsoleError()
}

export function onBuildOk() {
  Bus.emit({ type: ACTION_BUILD_OK })
}

export function onBuildError(message: string) {
  Bus.emit({ type: ACTION_BUILD_ERROR, message })
}

export function onRefresh() {
  Bus.emit({ type: ACTION_REFRESH })
}

export function onBeforeRefresh() {
  Bus.emit({ type: ACTION_BEFORE_REFRESH })
}

export function onVersionInfo(versionInfo: VersionInfo) {
  Bus.emit({ type: ACTION_VERSION_INFO, versionInfo })
}

export { getErrorByType } from '../internal/helpers/get-error-by-type'
export { getServerError } from '../internal/helpers/node-stack-frames'
export { default as ReactDevOverlay } from './ReactDevOverlay'
