import type { RuntimeErrorMetadata } from '../../../../server/dev/hot-reloader-types'
import { isNextRouterError } from '../../../../client/components/is-next-router-error'
import {
  formatConsoleArgs,
  parseConsoleArgs,
} from '../../../../client/lib/console'
import isError from '../../../../lib/is-error'
import { createConsoleError } from '../../../shared/console-error'
import { coerceError, setOwnerStackIfAvailable } from './stitched-error'
import { forwardUnhandledError, logUnhandledRejection } from '../forward-logs'

const queueMicroTask =
  globalThis.queueMicrotask || ((cb: () => void) => Promise.resolve().then(cb))

export function handleConsoleError(
  originError: unknown,
  consoleErrorArgs: any[]
) {
  let error: Error
  const { environmentName } = parseConsoleArgs(consoleErrorArgs)
  if (isError(originError)) {
    error = createConsoleError(originError, environmentName)
  } else {
    error = createConsoleError(
      formatConsoleArgs(consoleErrorArgs),
      environmentName
    )
  }
  setOwnerStackIfAvailable(error)

  const { dispatcher } =
    require('next/dist/compiled/next-devtools') as typeof import('next/dist/compiled/next-devtools')
  queueMicroTask(() => dispatcher.onUnhandledError(error))
}

export function handleClientError(
  error: Error,
  metadata: RuntimeErrorMetadata | undefined = undefined
) {
  const { dispatcher } =
    require('next/dist/compiled/next-devtools') as typeof import('next/dist/compiled/next-devtools')
  const { takeRuntimeErrorMetadata } =
    require('./runtime-error-metadata') as typeof import('./runtime-error-metadata')
  const occurrence = metadata ?? takeRuntimeErrorMetadata(error)
  // The overlay queues events until its own root mounts. Do not depend on
  // HotReload committing: an initial application failure can prevent that.
  queueMicroTask(() => dispatcher.onUnhandledError(error, occurrence))
}

function onUnhandledError(event: WindowEventMap['error']): void | boolean {
  const thrownValue: unknown = event.error
  if (isNextRouterError(thrownValue)) {
    event.preventDefault()
    return false
  }
  // When there's an error property present, we log the error to error overlay.
  // Otherwise we don't do anything as it's not logging in the console either.
  if (thrownValue) {
    const error = coerceError(thrownValue)
    setOwnerStackIfAvailable(error)
    const { takeRuntimeErrorMetadata } =
      require('./runtime-error-metadata') as typeof import('./runtime-error-metadata')
    const { isRecoverableError } =
      require('../../../../client/react-client-callbacks/on-recoverable-error') as typeof import('../../../../client/react-client-callbacks/on-recoverable-error')
    handleClientError(
      error,
      takeRuntimeErrorMetadata(error) ??
        (isRecoverableError(error) ? undefined : { fatal: false })
    )
    forwardUnhandledError(error)
  }
}

function onUnhandledRejection(ev: WindowEventMap['unhandledrejection']): void {
  const reason: unknown = ev?.reason
  if (isNextRouterError(reason)) {
    ev.preventDefault()
    return
  }

  const error = coerceError(reason)
  setOwnerStackIfAvailable(error)

  const { dispatcher } =
    require('next/dist/compiled/next-devtools') as typeof import('next/dist/compiled/next-devtools')
  dispatcher.onUnhandledRejection(error, { fatal: false })

  logUnhandledRejection(reason)
}

export function handleGlobalErrors() {
  if (typeof window !== 'undefined') {
    try {
      // Increase the number of stack frames on the client
      Error.stackTraceLimit = 50
    } catch {}

    window.addEventListener('error', onUnhandledError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
  }
}
