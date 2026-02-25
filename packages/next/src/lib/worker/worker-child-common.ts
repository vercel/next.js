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
 * An optional `onInitialize` hook is called after INITIALIZE, before any CALL;
 * the thread child uses this to set `process.env.JEST_WORKER_ID`.
 */
export function createMessageHandler(
  transport: ChildTransport,
  onInitialize?: (message: ChildMessage) => void
): (message: ChildMessage) => void {
  let workerModule: any = null
  let initialized = false
  let setupArgs: unknown[] = []

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

  function reportClientError(requestId: number, error: unknown): void {
    reportErrorMessage(requestId, error, PARENT_MESSAGE_CLIENT_ERROR)
  }

  function reportInitializeError(error: unknown): void {
    if (error == null) {
      error = new Error('"null" or "undefined" thrown')
    }
    const err = error as Error
    transport.send([
      PARENT_MESSAGE_SETUP_ERROR,
      err.constructor?.name ?? 'Error',
      err.message,
      err.stack,
    ])
  }

  function reportErrorMessage(
    requestId: number,
    error: unknown,
    type: typeof PARENT_MESSAGE_CLIENT_ERROR
  ): void {
    if (error == null) {
      error = new Error('"null" or "undefined" thrown')
    }
    const err = error as Error
    transport.send([
      type,
      requestId,
      err.constructor?.name ?? 'Error',
      err.message,
      err.stack,
      typeof error === 'object' ? { ...error } : error,
    ])
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

  function execMethod(
    requestId: number,
    method: string,
    args: unknown[]
  ): void {
    // eslint-disable-next-line no-eval
    const main = eval('require')(workerModule)

    let fn: Function
    if (method === 'default') {
      fn = main.__esModule ? main['default'] : main
    } else {
      fn = main[method]
    }

    function execHelper(): void {
      execFunction(
        fn,
        main,
        args,
        (result) => reportSuccess(requestId, result),
        (error) => reportClientError(requestId, error)
      )
    }

    if (initialized || !main.setup) {
      execHelper()
      return
    }

    initialized = true
    execFunction(main.setup, main, setupArgs, execHelper, reportInitializeError)
  }

  function end(): void {
    // eslint-disable-next-line no-eval
    const main = eval('require')(workerModule)
    if (!main.teardown) {
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
        workerModule = message[2]
        setupArgs = message[3]
        onInitialize?.(message)
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
