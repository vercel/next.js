/**
 * Shared protocol logic for both child_process and worker_threads child files.
 *
 * The only difference between the two child variants is how they send/receive
 * messages and how they "exit" (remove the listener vs process.exit). This
 * module captures all the shared logic: module loading, method execution,
 * setup/teardown orchestration, and error serialization.
 */
import {
  CHILD_MESSAGE_INITIALIZE,
  CHILD_MESSAGE_CALL,
  CHILD_MESSAGE_END,
  PARENT_MESSAGE_OK,
  PARENT_MESSAGE_CLIENT_ERROR,
  PARENT_MESSAGE_SETUP_ERROR,
  PARENT_MESSAGE_READY,
  type ChildMessage,
} from './types'

/** Transport abstraction: how the child sends messages back to the parent */
export interface ChildTransport {
  send(message: unknown[]): void
  /** Called when the child should stop listening (e.g. after END) */
  disconnect(): void
}

/**
 * Create a message listener that handles the parent→child protocol.
 *
 * Call the returned function with each incoming `ChildMessage`. It handles
 * INITIALIZE, CALL, and END internally, using the provided `transport` to
 * reply.
 *
 * An optional `onInitialize` hook is called after INITIALIZE, before any CALL.
 */
export function createMessageHandler(
  transport: ChildTransport,
  onInitialize?: (message: ChildMessage) => void
): (message: ChildMessage) => void {
  /** The loaded worker module (set during INITIALIZE) */
  let main: any = null

  function isPromise(value: unknown): value is Promise<unknown> {
    return (
      !!value &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as any).then === 'function'
    )
  }

  function reportSuccess(requestId: number, result: unknown): void {
    transport.send([PARENT_MESSAGE_OK, requestId, result])
  }

  /** Normalize an unknown thrown value into a structured error descriptor */
  function normalizeError(error: unknown): {
    name: string
    message: string
    stack: string | undefined
  } {
    if (error == null) {
      error = new Error('"null" or "undefined" thrown')
    }
    const err = error as Error
    return {
      name: err.constructor?.name ?? 'Error',
      message: err.message,
      stack: err.stack,
    }
  }

  function reportClientError(requestId: number, error: unknown): void {
    const e = normalizeError(error)
    transport.send([
      PARENT_MESSAGE_CLIENT_ERROR,
      requestId,
      e.name,
      e.message,
      e.stack,
      // Spread extra properties from the original error (e.g. `code`, `digest`)
      typeof error === 'object' ? { ...error } : error,
    ])
  }

  function reportInitializeError(error: unknown): void {
    const e = normalizeError(error)
    transport.send([PARENT_MESSAGE_SETUP_ERROR, e.name, e.message, e.stack])
  }

  /**
   * Call `fn` with `args` in `ctx`, routing the result (sync or async) to
   * `onSuccess` or `onError`.
   */
  function execFunction(
    fn: Function,
    ctx: any,
    args: unknown[],
    onSuccess: (result: unknown) => void,
    onError: (error: unknown) => void
  ): void {
    let result: unknown
    try {
      result = fn.apply(ctx, args)
    } catch (err) {
      onError(err)
      return
    }
    if (isPromise(result)) {
      result.then(onSuccess, onError)
    } else {
      onSuccess(result)
    }
  }

  /**
   * Load the worker module, run its setup() if present, and send READY.
   * Called once during INITIALIZE.
   */
  function initialize(workerPath: string, setupArgs: unknown[]): void {
    try {
      main = require(workerPath)
    } catch (err) {
      // Module not found, syntax error, etc. Report back to the parent so it
      // doesn't wait for PARENT_MESSAGE_READY that will never arrive.
      reportInitializeError(err)
      return
    }

    if (!main.setup) {
      transport.send([PARENT_MESSAGE_READY])
      return
    }

    if (typeof main.setup !== 'function') {
      reportInitializeError(
        new TypeError(
          `Worker module exports a non-function "setup": ${typeof main.setup}`
        )
      )
      return
    }

    execFunction(
      main.setup,
      main,
      setupArgs,
      () => transport.send([PARENT_MESSAGE_READY]),
      reportInitializeError
    )
  }

  function execMethod(
    requestId: number,
    method: string,
    args: unknown[]
  ): void {
    let fn: unknown
    if (method === 'default') {
      fn = main.__esModule ? main['default'] : main
      if (typeof fn !== 'function') {
        reportClientError(
          requestId,
          new TypeError(`Worker default export is not a function: ${typeof fn}`)
        )
        return
      }
    } else {
      // Guard against prototype-chain traversal (e.g. "constructor", "__proto__",
      // "toString"). Only own properties of the module are callable.
      if (!Object.prototype.hasOwnProperty.call(main, method)) {
        reportClientError(
          requestId,
          new TypeError(`Worker has no own export named "${method}"`)
        )
        return
      }
      fn = main[method]
      if (typeof fn !== 'function') {
        reportClientError(
          requestId,
          new TypeError(
            `Worker export "${method}" is not a function: ${typeof fn}`
          )
        )
        return
      }
    }

    execFunction(
      fn as Function,
      main,
      args,
      (result) => reportSuccess(requestId, result),
      (error) => reportClientError(requestId, error)
    )
  }

  function end(): void {
    if (typeof main?.teardown !== 'function') {
      transport.disconnect()
      return
    }
    execFunction(
      main.teardown,
      main,
      [],
      () => transport.disconnect(),
      () => transport.disconnect()
    )
  }

  // The message listener returned to the caller
  return function messageListener(message: ChildMessage): void {
    switch (message[0]) {
      case CHILD_MESSAGE_INITIALIZE:
        onInitialize?.(message)
        initialize(message[1], message[2])
        break
      case CHILD_MESSAGE_CALL:
        execMethod(message[1], message[2], message[3])
        break
      case CHILD_MESSAGE_END:
        end()
        break
      default:
        throw new TypeError(
          'Unexpected request from parent process: ' + (message as any)[0]
        )
    }
  }
}
