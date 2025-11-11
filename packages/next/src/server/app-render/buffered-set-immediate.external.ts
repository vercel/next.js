import { promisify } from 'node:util'

let isEnabled = false
const bufferedImmediatesQueue: QueueItem[] = []

const originalSetImmediate = globalThis.setImmediate
const originalClearImmediate = globalThis.clearImmediate

export function install() {
  globalThis.setImmediate =
    // Workaround for missing __promisify__ which is not a real property
    patchedSetImmediate as unknown as typeof setImmediate
  globalThis.clearImmediate = patchedClearImmediate
}

export function startBufferingImmediates() {
  isEnabled = true
}

export function stopBufferingImmediates() {
  if (!isEnabled) {
    return
  }
  isEnabled = false

  // Now, we actually schedule the immediates that we queued for later
  scheduleBufferedImmediates()
}

function scheduleBufferedImmediates() {
  for (const queueItem of bufferedImmediatesQueue) {
    if (queueItem.isCleared) {
      continue
    }
    const { immediateObject, callback, args, hasRef } = queueItem
    const nativeImmediateObject = args
      ? originalSetImmediate(callback, ...args)
      : originalSetImmediate(callback)

    // Mirror unref() calls
    if (!hasRef) {
      nativeImmediateObject.unref()
    }

    // Now that we're no longer buffering the immediate,
    // make the BufferedImmediate proxy calls to the native object instead
    immediateObject[INTERNALS].queueItem = null
    immediateObject[INTERNALS].nativeImmediate = nativeImmediateObject
    clearQueueItem(queueItem)
  }
  bufferedImmediatesQueue.length = 0
}

type QueueItem = ActiveQueueItem | ClearedQueueItem
type ActiveQueueItem = {
  isCleared: false
  callback: (...args: any[]) => any
  args: any[] | null
  hasRef: boolean
  immediateObject: BufferedImmediate
}
type ClearedQueueItem = {
  isCleared: true
  callback: null
  args: null
  hasRef: null
  immediateObject: null
}

function clearQueueItem(originalQueueItem: QueueItem) {
  const queueItem = originalQueueItem as ClearedQueueItem
  queueItem.isCleared = true
  queueItem.callback = null
  queueItem.args = null
  queueItem.hasRef = null
  queueItem.immediateObject = null
}

//========================================================

function patchedSetImmediate<TArgs extends any[]>(
  callback: (...args: TArgs) => void,
  ...args: TArgs
): NodeJS.Immediate
function patchedSetImmediate(callback: (args: void) => void): NodeJS.Immediate
function patchedSetImmediate(): NodeJS.Immediate {
  if (!isEnabled) {
    return originalSetImmediate.apply(
      null,
      // @ts-expect-error: this is valid, but typescript doesn't get it
      arguments
    )
  }

  if (arguments.length === 0 || typeof arguments[0] !== 'function') {
    // Replicate the error that setImmediate throws
    const error = new TypeError(
      `The "callback" argument must be of type function. Received ${typeof arguments[0]}`
    )
    ;(error as any).code = 'ERR_INVALID_ARG_TYPE'
    throw error
  }

  const callback: (...args: any[]) => any = arguments[0]
  let args: any[] | null =
    arguments.length > 1 ? Array.prototype.slice.call(arguments, 1) : null

  const immediateObject = new BufferedImmediate()

  const queueItem: ActiveQueueItem = {
    isCleared: false,
    callback,
    args,
    hasRef: true,
    immediateObject,
  }
  bufferedImmediatesQueue.push(queueItem)

  immediateObject[INTERNALS].queueItem = queueItem

  return immediateObject
}

function patchedSetImmediatePromisify<T = void>(
  value: T,
  options?: import('node:timers').TimerOptions
): Promise<T> {
  if (!isEnabled) {
    const originalPromisify: (typeof setImmediate)['__promisify__'] =
      // @ts-expect-error: the types for `promisify.custom` are strange
      originalSetImmediate[promisify.custom]
    return originalPromisify(value, options)
  }

  return new Promise<T>((resolve, reject) => {
    // The abort signal makes the promise reject.
    // If it is already aborted, we reject immediately.
    const signal = options?.signal
    if (signal && signal.aborted) {
      return reject(signal.reason)
    }

    const immediate = patchedSetImmediate(resolve, value)
    if (options?.ref === false) {
      immediate.unref()
    }

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          patchedClearImmediate(immediate)
          reject(signal.reason)
        },
        { once: true }
      )
    }
  })
}

patchedSetImmediate[promisify.custom] = patchedSetImmediatePromisify

const patchedClearImmediate = (
  immediateObject: NodeJS.Immediate | undefined
) => {
  if (immediateObject && INTERNALS in immediateObject) {
    ;(immediateObject as BufferedImmediate)[Symbol.dispose]()
  } else {
    originalClearImmediate(immediateObject)
  }
}

//========================================================

const INTERNALS: unique symbol = Symbol.for('next.Immediate.internals')

type QueuedImmediateInternals =
  | {
      queueItem: ActiveQueueItem | null
      nativeImmediate: null
    }
  | {
      queueItem: null
      nativeImmediate: NodeJS.Immediate
    }

/** Makes sure that we're implementing all the public `Immediate` methods */
interface NativeImmediate extends NodeJS.Immediate {}

/** Implements a shim for the native `Immediate` class returned by `setImmediate` */
class BufferedImmediate implements NativeImmediate {
  [INTERNALS]: QueuedImmediateInternals = {
    queueItem: null,
    nativeImmediate: null,
  }
  hasRef() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      return internals.queueItem.hasRef
    } else if (internals.nativeImmediate) {
      return internals.nativeImmediate.hasRef()
    } else {
      return false
    }
  }
  ref() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      internals.queueItem.hasRef = true
    } else if (internals.nativeImmediate) {
      internals.nativeImmediate.ref()
    }
    return this
  }
  unref() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      internals.queueItem.hasRef = false
    } else if (internals.nativeImmediate) {
      internals.nativeImmediate.unref()
    }
    return this
  }

  // TODO: is this just a noop marker?
  _onImmediate() {}

  [Symbol.dispose]() {
    // This is equivalent to `clearImmediate`.
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      // this is still queued. drop it.
      const queueItem = internals.queueItem
      internals.queueItem = null
      clearQueueItem(queueItem)
    } else if (internals.nativeImmediate) {
      // If we executed the queue, and we have a native immediate.
      originalClearImmediate(internals.nativeImmediate)
    }
  }
}
