import { promisify } from 'node:util'
import { InvariantError } from '../../shared/lib/invariant-error'
import { bindSnapshot } from './async-local-storage'

let isInstalled = false
let isEnabled = false
const queuedImmediates: QueueItem[] = []
let pendingNextTicks = 0

// TODO: check if this patches `timers/promises` as well
const originalSetImmediate = globalThis.setImmediate
const originalClearImmediate = globalThis.clearImmediate
const originalNextTick = process.nextTick

export function install() {
  globalThis.setImmediate =
    // Workaround for missing __promisify__ which is not a real property
    patchedSetImmediate as unknown as typeof setImmediate
  globalThis.clearImmediate = patchedClearImmediate
  process.nextTick = patchedNextTick

  isInstalled = true
}

export function runPendingImmediatesAfterCurrentTask() {
  startCapturingImmediates()
  scheduleWorkAfterTicksAndMicrotasks()
}

function scheduleWorkAfterTicksAndMicrotasks() {
  originalNextTick(() => {
    queueMicrotask(() => {
      originalNextTick(() => {
        if (pendingNextTicks > 0) {
          // We have raw nextTicks. Let those run first.
          debug?.(`scheduler :: yielding to ${pendingNextTicks} nextTicks`)
          return scheduleWorkAfterTicksAndMicrotasks()
        }

        return performWork()
      })
    })
  })
}

function performWork() {
  debug?.(`scheduler :: performing work`)

  // Find the first (if any) queued immediate that wasn't cleared
  let queueItem: ActiveQueueItem | null = null
  while (queuedImmediates.length) {
    const maybeQueItem = queuedImmediates.shift()!
    if (!maybeQueItem.isCleared) {
      queueItem = maybeQueItem
      break
    }
  }
  if (!queueItem) {
    debug?.(`scheduler :: no immediates queued, exiting`)
    stopCapturingImmediates()
    return
  }

  const { immediateObject, callback, args } = queueItem

  immediateObject[INTERNALS].queueItem = null
  clearQueueItem(queueItem)

  // schedule the loop again in case there's more immediates after this.
  scheduleWorkAfterTicksAndMicrotasks()

  // execute the callback.
  if (args) {
    callback.apply(null, args)
  } else {
    callback()
  }
}

function startCapturingImmediates() {
  if (!isInstalled) {
    throw new InvariantError('install() was not called')
  }
  isEnabled = true
}

function stopCapturingImmediates() {
  if (!isInstalled) {
    throw new InvariantError('install() was not called')
  }
  if (!isEnabled) {
    return
  }
  isEnabled = false
}

type QueueItem = ActiveQueueItem | ClearedQueueItem
type ActiveQueueItem = {
  isCleared: false
  callback: (...args: any[]) => any
  args: any[] | null
  immediateObject: NextImmediate
}
type ClearedQueueItem = {
  isCleared: true
  callback: null
  args: null
  immediateObject: null
}

function clearQueueItem(originalQueueItem: QueueItem) {
  const queueItem = originalQueueItem as ClearedQueueItem
  queueItem.isCleared = true
  queueItem.callback = null
  queueItem.args = null
  queueItem.immediateObject = null
}

//========================================================

function patchedNextTick<TArgs extends any[]>(
  callback: (...args: TArgs) => void,
  ...args: TArgs
): void
function patchedNextTick() {
  if (!isEnabled) {
    return originalNextTick.apply(
      null,
      // @ts-expect-error: this is valid, but typescript doesn't get it
      arguments
    )
  }

  if (arguments.length === 0 || typeof arguments[0] !== 'function') {
    // Replicate the error that nextTick throws
    const error = new TypeError(
      `The "callback" argument must be of type function. Received ${typeof arguments[0]}`
    )
    ;(error as any).code = 'ERR_INVALID_ARG_TYPE'
    throw error
  }

  debug?.(
    `scheduler :: process.nextTick called (previous pending: ${pendingNextTicks})`
  )

  // TODO: avoid unnecessary ...args
  const [callback, ...args] = arguments

  pendingNextTicks += 1
  return originalNextTick(() => {
    pendingNextTicks -= 1
    debug?.(
      `scheduler :: process.nextTick executing (still pending: ${pendingNextTicks})`
    )
    callback(...args)
  })
}

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

  const callbackWithAsyncContext = bindSnapshot(
    // TODO: bindSnapshot says we shouldn't pass a named function to it, does that apply here?
    (...innerArgs: any[]) => callback(...innerArgs)
  )
  const immediateObject = new NextImmediate()

  const queueItem: ActiveQueueItem = {
    isCleared: false,
    callback: callbackWithAsyncContext,
    args,
    immediateObject,
  }
  queuedImmediates.push(queueItem)

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

    // Note that we're ignoring `options.ref`, because `unref()` has no effect
    // on our patched immediates

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
    ;(immediateObject as NextImmediate)[Symbol.dispose]()
  } else {
    originalClearImmediate(immediateObject)
  }
}

//========================================================

const INTERNALS: unique symbol = Symbol.for('next.Immediate.internals')

type NextImmediateInternals = {
  /** Stored to reflect `ref()`/`unref()` calls, but has no effect otherwise */
  hasRef: boolean
  queueItem: ActiveQueueItem | null
}

/** Makes sure that we're implementing all the public `Immediate` methods */
interface NativeImmediate extends NodeJS.Immediate {}

/** Implements a shim for the native `Immediate` class returned by `setImmediate` */
class NextImmediate implements NativeImmediate {
  [INTERNALS]: NextImmediateInternals = {
    queueItem: null,
    hasRef: true,
  }
  hasRef() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      return internals.hasRef
    } else {
      // if we're no longer queued (cleared or executed), hasRef is always false
      return false
    }
  }
  ref() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      internals.hasRef = true
    }
    return this
  }
  unref() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      internals.hasRef = false
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
    }
  }
}

// ==========================================

// TODO: this causes the scheduler to loop -- apparently the write schedules a nextTick somewhere inside?
const debug =
  process.env.NEXT_DEBUG_IMMEDIATES !== '1'
    ? undefined
    : (...args: any[]) => {
        const { inspect } = require('node:util') as typeof import('node:util')

        let logLine =
          args
            .map((arg) =>
              typeof arg === 'string' ? arg : inspect(arg, { colors: true })
            )
            .join(' ') + '\n'

        logLine = '\x1B[2m' + logLine + '\x1B[22m' // styleText('dim', logLine)
        process.stdout.write(logLine)
      }
