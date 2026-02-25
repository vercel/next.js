import {
  CHILD_MESSAGE_INITIALIZE,
  CHILD_MESSAGE_CALL,
  CHILD_MESSAGE_END,
  PARENT_MESSAGE_OK,
  PARENT_MESSAGE_CLIENT_ERROR,
  PARENT_MESSAGE_SETUP_ERROR,
  type ChildMessage,
} from './types'

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
  if (!process.send) {
    throw new Error('Child can only be used on a forked process')
  }
  process.send([PARENT_MESSAGE_OK, requestId, result])
}

function reportClientError(requestId: number, error: unknown): void {
  reportError(requestId, error, PARENT_MESSAGE_CLIENT_ERROR)
}

function reportInitializeError(error: unknown): void {
  if (!process.send) {
    throw new Error('Child can only be used on a forked process')
  }
  if (error == null) {
    error = new Error('"null" or "undefined" thrown')
  }
  const err = error as Error
  process.send([
    PARENT_MESSAGE_SETUP_ERROR,
    err.constructor?.name ?? 'Error',
    err.message,
    err.stack,
  ])
}

function reportError(
  requestId: number,
  error: unknown,
  type: typeof PARENT_MESSAGE_CLIENT_ERROR
): void {
  if (!process.send) {
    throw new Error('Child can only be used on a forked process')
  }
  if (error == null) {
    error = new Error('"null" or "undefined" thrown')
  }
  const err = error as Error
  process.send([
    type,
    requestId,
    err.constructor?.name ?? 'Error',
    err.message,
    err.stack,
    typeof error === 'object' ? { ...error } : error,
  ])
}

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

function execMethod(requestId: number, method: string, args: unknown[]): void {
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
    exitProcess()
    return
  }
  execFunction(main.teardown, main, [], exitProcess, exitProcess)
}

function exitProcess(): void {
  process.removeListener('message', messageListener)
}

function messageListener(message: ChildMessage): void {
  switch (message[0]) {
    case CHILD_MESSAGE_INITIALIZE:
      workerModule = message[2]
      setupArgs = message[3]
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

process.on('message', messageListener)
