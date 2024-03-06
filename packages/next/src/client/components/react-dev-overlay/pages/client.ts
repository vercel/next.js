import * as Bus from './bus'
import { parseStack } from '../internal/helpers/parseStack'
import { parseComponentStack } from '../internal/helpers/parse-component-stack'
import {
  hydrationErrorState,
  patchConsoleError,
} from '../internal/helpers/hydration-error-info'

// Patch console.error to collect information about hydration errors
patchConsoleError()

let isRegistered = false
let stackTraceLimit: number | undefined = undefined

function onUnhandledError(ev: ErrorEvent) {
  const error = ev?.error
  if (!error || !(error instanceof Error) || typeof error.stack !== 'string') {
    // A non-error was thrown, we don't have anything to show. :-(
    return
  }

  if (
    error.message.match(/(hydration|content does not match|did not match)/i)
  ) {
    if (hydrationErrorState.warning) {
      // The patched console.error found hydration errors logged by React
      // Append the logged warning to the error message

      ;(error as any).details = {
        ...(error as any).details,
        // It contains the warning, component stack, server and client tag names
        ...hydrationErrorState,
      }
    }
    error.message += `\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error`
  }

  const e = error
  const componentStackFrames =
    typeof hydrationErrorState.componentStack === 'string'
      ? parseComponentStack(hydrationErrorState.componentStack)
      : undefined

  // Skip ModuleBuildError and ModuleNotFoundError, as it will be sent through onBuildError callback.
  // This is to avoid same error as different type showing up on client to cause flashing.
  if (e.name !== 'ModuleBuildError' && e.name !== 'ModuleNotFoundError') {
    Bus.emit({
      type: Bus.TYPE_UNHANDLED_ERROR,
      reason: error,
      frames: parseStack(e.stack!),
      componentStackFrames,
    })
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

  const e = reason
  Bus.emit({
    type: Bus.TYPE_UNHANDLED_REJECTION,
    reason: reason,
    frames: parseStack(e.stack!),
  })
}

function register() {
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
}

function unregister() {
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
}

function onBuildOk() {
  Bus.emit({ type: Bus.TYPE_BUILD_OK })
}

function onBuildError(message: string) {
  Bus.emit({ type: Bus.TYPE_BUILD_ERROR, message })
}

function onRefresh() {
  Bus.emit({ type: Bus.TYPE_REFRESH })
}

function onBeforeRefresh() {
  Bus.emit({ type: Bus.TYPE_BEFORE_REFRESH })
}

export { getErrorByType } from '../internal/helpers/getErrorByType'
export { getServerError } from '../internal/helpers/nodeStackFrames'
export { default as ReactDevOverlay } from './ReactDevOverlay'
export {
  onBuildOk,
  onBuildError,
  register,
  unregister,
  onBeforeRefresh,
  onRefresh,
}
