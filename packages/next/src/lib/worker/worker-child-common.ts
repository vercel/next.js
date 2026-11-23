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
  PARENT_MESSAGE_LOAD_ERROR,
  type ChildMessage,
  type SerializedErrorCause,
} from './types'

/** How many levels of nested `cause`s are sent to the parent. */
const MAX_CAUSE_DEPTH = 5

/**
 * Whether the error has a `cause` (an own property, like the one set by
 * `new Error(message, { cause })`). An `undefined` cause counts as none.
 */
function hasOwnCause(error: unknown): error is { cause: unknown } {
  return (
    error !== null &&
    typeof error === 'object' &&
    Object.prototype.hasOwnProperty.call(error, 'cause') &&
    (error as { cause: unknown }).cause !== undefined
  )
}

/**
 * Serialize the `cause` of an error. It's usually a non-enumerable own
 * property, so spreading the error doesn't include it.
 */
function serializeCause(cause: unknown, depth: number): SerializedErrorCause {
  if (!(cause instanceof Error)) {
    return { value: cause }
  }
  const properties: Record<string, unknown> = { ...cause }
  delete properties.cause
  return {
    name: cause.name,
    message: cause.message,
    stack: cause.stack,
    properties,
    cause:
      depth < MAX_CAUSE_DEPTH && hasOwnCause(cause)
        ? serializeCause(cause.cause, depth + 1)
        : undefined,
  }
}

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
      typeof (value as { then?: unknown }).then === 'function'
    )
  }

  function reportSuccess(requestId: number, result: unknown): void {
    try {
      transport.send([PARENT_MESSAGE_OK, requestId, result])
    } catch (err) {
      // The result can't be serialized (e.g. a BigInt or circular data for a
      // child process, a function for a worker thread). Fail only this call;
      // the worker and its other calls are fine.
      reportClientError(requestId, err)
    }
  }

  /** Normalize an unknown thrown value into a structured error descriptor */
  function normalizeError(error: unknown): {
    name: string
    message: string
    stack: string | undefined
  } {
    const err = error as Error
    return {
      name: err.constructor?.name ?? 'Error',
      message: err.message,
      stack: err.stack,
    }
  }

  function reportClientError(requestId: number, error: unknown): void {
    if (error == null) {
      error = new Error('"null" or "undefined" thrown')
    }
    const e = normalizeError(error)
    let properties: unknown = error
    let cause: SerializedErrorCause | undefined
    if (typeof error === 'object') {
      try {
        // Extra properties of the original error (e.g. `code`, `digest`).
        const extra: Record<string, unknown> = { ...error }
        delete extra.cause
        properties = extra
      } catch {
        // E.g. a throwing getter: send the error without its properties.
        properties = undefined
      }
      if (properties !== undefined) {
        try {
          if (hasOwnCause(error)) {
            cause = serializeCause(error.cause, 1)
          }
        } catch {
          // E.g. a throwing getter in the cause: send the error without it.
        }
      }
    }
    const send = (
      extraProperties: unknown,
      errorCause?: SerializedErrorCause
    ) =>
      transport.send([
        PARENT_MESSAGE_CLIENT_ERROR,
        requestId,
        e.name,
        e.message,
        e.stack,
        // The extra properties, or a thrown non-object value (e.g. a string)
        // itself.
        extraProperties,
        errorCause,
      ])
    if (properties !== undefined || typeof error !== 'object') {
      try {
        send(properties, cause)
        return
      } catch {
        // Something can't be serialized (e.g. a function, or circular data).
      }
      if (cause !== undefined) {
        try {
          // Maybe it's only the cause: keep the error's own properties.
          send(properties)
          return
        } catch {}
      }
    }
    // The error's extra properties can't be serialized. Send what can always
    // be serialized, so the call still fails with its error instead of
    // crashing the worker.
    transport.send([
      PARENT_MESSAGE_CLIENT_ERROR,
      requestId,
      String(e.name),
      String(e.message),
      e.stack === undefined ? undefined : String(e.stack),
      {},
    ])
  }

  function reportInitializeError(error: unknown): void {
    const e = normalizeError(error ?? new Error('"null" or "undefined" thrown'))
    transport.send([PARENT_MESSAGE_SETUP_ERROR, e.name, e.message, e.stack])
  }

  function reportLoadError(error: unknown): void {
    const e = normalizeError(error ?? new Error('"null" or "undefined" thrown'))
    transport.send([PARENT_MESSAGE_LOAD_ERROR, e.name, e.message, e.stack])
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
      // Module not found, syntax error, etc. Report it as a load error (not a
      // setup error): the module isn't available, so the parent must not
      // dispatch CALLs to this worker.
      reportLoadError(err)
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
    // The parent stops dispatching after a load error, but never let a stray
    // CALL crash the worker by dereferencing the missing module.
    if (main == null) {
      reportClientError(requestId, new Error('Worker module is not loaded'))
      return
    }

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
      (error) => {
        console.error('Worker teardown() threw:', error)
        transport.disconnect()
      }
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
          'Unexpected request from parent process: ' + (message as unknown[])[0]
        )
    }
  }
}
