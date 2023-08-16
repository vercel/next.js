import * as Bus from './internal/bus'
import { parseStack } from './internal/helpers/parseStack'
import { parseComponentStack } from 'next/dist/client/components/react-dev-overlay/internal/helpers/parse-component-stack'
import {
  hydrationErrorComponentStack,
  hydrationErrorWarning,
  patchConsoleError,
} from 'next/dist/client/components/react-dev-overlay/internal/helpers/hydration-error-info'

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
    if (hydrationErrorWarning) {
      // The patched console.error found hydration errors logged by React
      // Append the logged warning to the error message
      error.message += '\n\n' + hydrationErrorWarning
    }
    error.message += `\n\nSee more info here: https://nextjs.org/docs/messages/react-hydration-error`
  }

  const e = error
  const componentStack =
    typeof hydrationErrorComponentStack === 'string'
      ? parseComponentStack(hydrationErrorComponentStack).map(
          (frame: any) => frame.component
        )
      : undefined
  Bus.emit({
    type: Bus.TYPE_UNHANDLED_ERROR,
    reason: error,
    frames: parseStack(e.stack!),
    componentStack,
  })
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

export { getErrorByType } from './internal/helpers/getErrorByType'
export { getServerError } from './internal/helpers/nodeStackFrames'
export { default as ReactDevOverlay } from './internal/ReactDevOverlay'
export {
  onBuildOk,
  onBuildError,
  register,
  unregister,
  onBeforeRefresh,
  onRefresh,
}
