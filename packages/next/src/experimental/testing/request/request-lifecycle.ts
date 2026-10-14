import { AwaiterOnce } from '../../../server/after/awaiter'
import type { RequestLifecycleOpts } from '../../../server/base-server'
import { CloseController } from '../../../server/web/web-on-close'

export class RequestLifecycleError extends Error {
  readonly errors: unknown[]

  constructor(errors: unknown[]) {
    super('Request lifecycle tasks failed')
    this.name = 'RequestLifecycleError'
    this.errors = [...errors]
  }
}

export interface RequestLifecycle {
  readonly renderOpts: RequestLifecycleOpts
  close(): Promise<void>
}

/**
 * Supply the real AfterContext with request-close and waitUntil callbacks.
 * The renderer must finish or dispose its stream before calling close, including
 * after an abort or render failure. Register that combined finalizer with the
 * test attempt before rendering so setup failures also drain scheduled work.
 *
 * This lifetime does not cancel after() tasks. The execution host retains its
 * hard deadline for tasks that never settle, just as it does for render work.
 */
export function createRequestLifecycle(): RequestLifecycle {
  const errors: unknown[] = []
  const captureError = (error: unknown) => {
    errors.push(error)
  }
  const awaiter = new AwaiterOnce({ onError: captureError })
  const closeController = new CloseController()
  let closing: Promise<void> | undefined

  return {
    renderOpts: {
      waitUntil: awaiter.waitUntil,
      onClose: closeController.onClose.bind(closeController),
      onAfterTaskError: captureError,
    },
    close() {
      return (closing ??= Promise.resolve().then(async () => {
        try {
          closeController.dispatchClose()
        } catch (error) {
          captureError(error)
        }
        await awaiter.awaiting()
        if (errors.length > 0) {
          throw new RequestLifecycleError(errors)
        }
      }))
    },
  }
}
