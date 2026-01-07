import { promisify } from 'node:util'
import { InvariantError } from '../../shared/lib/invariant-error'
import { bindSnapshot } from '../app-render/async-local-storage'

type Execution = {
  state: ExecutionState
  queuedImmediates: QueueItem[]
}

enum ExecutionState {
  Waiting = 1,
  Working = 2,
  Finished = 3,
  Abandoned = 4,
}

let wasEnabledAtLeastOnce = false

let pendingNextTicks = 0
let currentExecution: Execution | null = null

const originalSetImmediate = globalThis.setImmediate
const originalClearImmediate = globalThis.clearImmediate
const originalNextTick = process.nextTick

export { originalSetImmediate as unpatchedSetImmediate }

function install() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    // Nothing to patch. The exported functions all error if used in the edge runtime,
    // so we're not going to violate any assumptions by not patching.
    return
  } else {
    debug?.('installing fast setImmediate patch')

    const nodeTimers = require('node:timers') as typeof import('node:timers')
    globalThis.setImmediate = nodeTimers.setImmediate =
      // Workaround for missing __promisify__ which is not a real property
      patchedSetImmediate as unknown as typeof setImmediate
    globalThis.clearImmediate = nodeTimers.clearImmediate =
      patchedClearImmediate

    const nodeTimersPromises =
      require('node:timers/promises') as typeof import('node:timers/promises')
    nodeTimersPromises.setImmediate =
      patchedSetImmediatePromise as typeof import('node:timers/promises').setImmediate

    process.nextTick = patchedNextTick
  }
}

/**
 * **WARNING: This function changes the usual behavior of the event loop!**
 * **Be VERY careful about where you call it.**
 *
 * Starts capturing calls to `setImmediate` to run them as "fast immediates".
 * All calls captured in this way will be executed after the current task
 * (after callbacks from `process.nextTick()`, microtasks, and nextTicks scheduled from microtasks).
 * This function needs to be called again in each task that needs the
 * "fast immediates" behavior.
 *
 * ### Motivation
 *
 * We don't want `setImmediate` to be considered IO in Cache Components.
 * To achieve this in a staged (pre)render, we want to allow immediates scheduled
 * in stage N to run before stage N+1.
 * Since we schedule stages using sequential `setTimeout`, this isn't possible without
 * intercepting `setImmediate` and doing the scheduling on our own.
 * We refer to this as a "fast immediate".
 *
 * Notably, this affects React's `scheduleWork` in render, which uses `setImmediate`.
 * This is desirable -- if async work was scheduled during a stage, then it should
 * get to run before we finish that stage.
 *
 * ### Example
 *
 * ```ts
 * setTimeout(() => {
 *   runPendingImmediatesAfterCurrentTask()
 *   console.log("timeout 1")
 *   setImmediate(() => {
 *     console.log("immediate!!!")
 *   })
 * })
 * setTimeout(() => {
 *   console.log("timeout 2")
 * })
 * ```
 * will print
 *
 * ```
 * timeout 1
 * immediate!!!
 * timeout 2
 * ```
 *
 * instead of the usual order
 * ```
 * timeout 1
 * timeout 2
 * immediate!!!
 * ```
 * > **NOTE**
 * > The above is *most common* order, but it's not guaranteed.
 * > Under some circumstances (e.g. when the event loop is blocked on CPU work),
 * > Node will reorder things and run the immediate before timeout 2.
 * > So, in a sense, we're just making this reordering happen consistently.
 *
 * Recursive `setImmediate` calls will also be executed as "fast immediates".
 * If multiple immediates were scheduled, `process.nextTick()` (and associated microtasks)
 * will be allowed to execute between them.
 * See the unit tests for more examples.
 * */
export function DANGEROUSLY_runPendingImmediatesAfterCurrentTask() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'DANGEROUSLY_runPendingImmediatesAfterCurrentTask cannot be called in the edge runtime'
    )
  } else {
    const execution = startCapturingImmediates()

    try {
      scheduleWorkAfterNextTicksAndMicrotasks(execution)
    } catch (err) {
      // If this error comes from a bail() call, rethrow it.
      if (execution.state === ExecutionState.Abandoned) {
        throw err
      }
      // Otherwise, bail out here.
      bail(
        execution,
        new InvariantError(
          'An unexpected error occurred while starting to capture immediates',
          {
            cause: err,
          }
        )
      )
    }
  }
}

/**
 * This should always be called a task after `DANGEROUSLY_runPendingImmediatesAfterCurrentTask`
 * to make sure that everything executed as expected and we're not left in an inconsistent state.
 * Ideally, this wouldn't be necessary, but we're not in control of the event loop
 * and need to guard against unexpected behaviors not forseen in this implementation,
 * so we have to be defensive.
 */
export function expectNoPendingImmediates() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'expectNoPendingImmediates cannot be called in the edge runtime'
    )
  } else {
    if (currentExecution !== null) {
      bail(
        currentExecution,
        new InvariantError(
          `Expected all captured immediates to have been executed (state: ${ExecutionState[currentExecution.state]})`
        )
      )
    }
  }
}

/**
 * Wait until all nextTicks and microtasks spawned from the current task are done,
 * then execute any immediates that they queued.
 * */
function scheduleWorkAfterNextTicksAndMicrotasks(execution: Execution) {
  if (execution.state !== ExecutionState.Waiting) {
    throw new InvariantError(
      `scheduleWorkAfterTicksAndMicrotasks can only be called while waiting (state: ${ExecutionState[execution.state]})`
    )
  }

  // We want to execute "fast immediates" after all the nextTicks and microtasks
  // spawned from the current task are done.
  // The ordering here is:
  //
  // 1. sync code
  // 2. process.nextTick (scheduled from sync code, or from one of these nextTicks)
  // 3. microtasks
  // 4. process.nextTick (scheduled from microtasks, e.g. `queueMicrotask(() => process.nextTick(callback))`)
  //
  // We want to run to run in step 4, because that's the latest point before the next tick.
  // However, there might also be other callbacks scheduled to run in that step.
  // But importantly, they had to be scheduled using a `process.nextTick`,
  // so we can detect them by checking if `pendingNextTicks > 0`.
  // In that case, we'll just reschedule ourselves in the same way again to let them run first.
  // (this process can theoretically repeat multiple times, hence the recursion).

  queueMicrotask(() => {
    // (note that this call won't increment `pendingNextTicks`,
    // only the patched `process.nextTick` does that, so this won't loop infinitely)
    originalNextTick(() => {
      // We're now in a nextTick, which means that we're executing inside `processTicksAndRejections`:
      // https://github.com/nodejs/node/blob/d546e7fd0bc3cbb4bcc2baae6f3aa44d2e81a413/lib/internal/process/task_queues.js#L84
      // All the work scheduled here will happen within that `processTicksAndRejections` loop.
      // Reading the source of `processTicksAndRejections` can help understand the timing here --
      // All we're really doing is strategically pushing callbacks into the two queues
      // (nextTicks and microtasks) that that function is currently looping over.

      try {
        if (
          execution.state === ExecutionState.Abandoned ||
          currentExecution !== execution
        ) {
          debug?.(`scheduler :: the execution was abandoned`)
          return
        }
        if (pendingNextTicks > 0) {
          // Other nextTicks have been scheduled. Let those run first, then try again --
          // we're simulating a event loop task, so all nextTicks should be exhausted before we execute.
          debug?.(`scheduler :: yielding to ${pendingNextTicks} nextTicks`)
          return scheduleWorkAfterNextTicksAndMicrotasks(execution)
        }

        // There's no other nextTicks, we're the last one, so we're about to move on to the next task (likely a timer).
        // Now, we can try and execute any queued immediates.
        return performWork(execution)
      } catch (err) {
        // If this error comes from a bail() call, rethrow it.

        // typescript can't tell that the state might've been mutated
        // and the narrowing from above is no longer valid
        const executionAfterWork = execution as Execution
        if (executionAfterWork.state === ExecutionState.Abandoned) {
          throw err
        }

        // Otherwise, bail out here (which will trigger an uncaught exception)
        // Note that we're using the same microtask trick as `safelyRunNextTickCallback`.
        queueMicrotask(() => {
          bail(
            execution,
            new InvariantError(
              'An unexpected error occurred while executing immediates',
              { cause: err }
            )
          )
        })
      }
    })
  })
}

/** Execute one immediate, and schedule a check for more (in case there's others in the queue) */
function performWork(execution: Execution) {
  if (execution.state === ExecutionState.Abandoned) {
    return
  }

  debug?.(`scheduler :: performing work`)

  if (execution.state !== ExecutionState.Waiting) {
    throw new InvariantError(
      `performWork can only be called while waiting (state: ${ExecutionState[execution.state]})`
    )
  }
  execution.state = ExecutionState.Working

  const queueItem = takeNextActiveQueueItem(execution)

  if (queueItem === null) {
    debug?.(`scheduler :: no immediates queued, exiting`)
    stopCapturingImmediates(execution)
    return
  }

  debug?.(`scheduler :: executing queued immediate`)

  const { immediateObject, callback, args } = queueItem

  immediateObject[INTERNALS].queueItem = null
  clearQueueItem(queueItem)

  // Execute the immediate.

  // If a sync error was thrown in the immediate, we want to trigger a `uncaughtException`.
  // However, we're executing in a nextTick, and if a nextTick callback errors,
  // It'll break out of `processTicksAndRejections` (note the lack of a `catch` block):
  //   https://github.com/nodejs/node/blob/d546e7fd0bc3cbb4bcc2baae6f3aa44d2e81a413/lib/internal/process/task_queues.js#L81-L97
  // Meaning that the event loop will stop executing nextTicks and move on to the next timer
  // (or other phase of the event loop, but we expect to be running in a sequence of timers here).
  // Then, the remaining ticks will run after that timer, since they're still in the queue.
  //
  // This would completely break the timing we're trying to achieve here --
  // The point of this patch is to execute immediates before the next timer!
  // So, we need to work around this behavior. (both here and in our `process.nextTick` patch).
  //
  // We can sidestep this by catching the synchronous error and rethrowing it in a microtask.
  // (NOTE: if we use `queueMicrotask`, it'll trigger `uncaughtException`, not `unhandledRejection`,
  // because there's no promise being rejected.)
  //
  // This will make `uncaughtException` happen:
  // - Before the next fast immediate (`scheduleWorkAfterNextTicksAndMicrotasks` also uses `queueMicrotask`).
  //   This is good, and matches usual observable behavior of immediates.
  // - AFTER nextTicks scheduled from the immediate itself.
  //   This deviates from native setImmediate, which would call `uncaughtException` first,
  //   and skip ahead to the next task as explained above.
  //
  // This is technically an observable difference in behavior, but it seems niche enough that
  // it shouldn't cause problems -- we don't expect user code to use `uncaughtException` for control flow,
  // only error reporting, so subtly changing the timing shouldn't matter.

  let didThrow = false
  let thrownValue: unknown = undefined
  queueMicrotask(() => {
    if (didThrow) {
      debug?.('scheduler :: rethrowing sync error from immediate in microtask')
      throw thrownValue
    }
  })

  try {
    if (args !== null) {
      callback.apply(null, args)
    } else {
      callback()
    }
  } catch (err) {
    // We'll rethrow the error in the microtask above.
    didThrow = true
    thrownValue = err
  }

  // Schedule the loop again in case there's more immediates after this one.
  // Note that we can't just check if the queue is empty now, because new immediates
  // might still be scheduled asynchronously, from an upcoming nextTick or microtask.
  execution.state = ExecutionState.Waiting
  scheduleWorkAfterNextTicksAndMicrotasks(execution)
}

function takeNextActiveQueueItem(execution: Execution): ActiveQueueItem | null {
  // Find the first (if any) queued immediate that wasn't cleared.
  // We don't remove immediates from the array when they're cleared,
  // so this requires some legwork to exclude (and possibly drop) cleared items.
  const { queuedImmediates } = execution

  let firstActiveItem: ActiveQueueItem | null = null
  let firstActiveItemIndex = -1
  for (let i = 0; i < queuedImmediates.length; i++) {
    const item = queuedImmediates[i]
    if (!item.isCleared) {
      firstActiveItem = item
      firstActiveItemIndex = i
      break
    }
  }

  if (firstActiveItem === null) {
    // We didn't find an active item.

    // If the queue isn't empty, then it must only contain cleared items. Empty it.
    if (queuedImmediates.length > 0) {
      queuedImmediates.length = 0
    }

    return null
  }

  // Remove all items up to and including `nextActiveItemIndex` from the queue.
  // (if it's not the first item, then it must be preceded by cleared items, which we want to drop anyway)
  if (firstActiveItemIndex === 0) {
    // Fast path - drop the first item
    // (`splice` creates a result array for the removed items, so this is more efficient)
    queuedImmediates.shift()
  } else {
    queuedImmediates.splice(0, firstActiveItemIndex + 1)
  }

  return firstActiveItem
}

function startCapturingImmediates(): Execution {
  if (currentExecution !== null) {
    bail(
      currentExecution,
      new InvariantError(
        `Cannot start capturing immediates again without finishing the previous task (state: ${ExecutionState[currentExecution.state]})`
      )
    )
  }
  wasEnabledAtLeastOnce = true

  const execution: Execution = {
    state: ExecutionState.Waiting,
    queuedImmediates: [],
  }
  currentExecution = execution

  return execution
}

function stopCapturingImmediates(execution: Execution) {
  if (execution.state === ExecutionState.Abandoned) {
    return
  }

  // This check enforces that we run performWork at least once before stopping
  // to make sure that we've waited for all the nextTicks and microtasks
  // that might've scheduled some immediates after sync code.
  if (execution.state !== ExecutionState.Working) {
    throw new InvariantError(
      `Cannot stop capturing immediates before execution is finished (state: ${ExecutionState[execution.state]})`
    )
  }

  execution.state = ExecutionState.Finished

  if (currentExecution === execution) {
    currentExecution = null
  }
}

function bail(execution: Execution, error: Error): never {
  // Reset the state as best we can to prevent further crashes.
  // Otherwise, any subsequent call to `DANGEROUSLY_runPendingImmediatesAfterCurrentTask`
  // would error, requiring a server restart to fix.

  if (currentExecution === execution) {
    currentExecution = null
  }

  execution.state = ExecutionState.Abandoned

  // If we have any queued immediates, schedule them with native `setImmediate` and clear the queue.
  // We don't want to skip running them altogether, because that could lead to
  // e.g. hanging promises (for `new Promise((resolve) => setImmediate(resolve))`),
  // but we're in an inconsistent state and can't run them as fast immediates,
  // so this is the next best thing.
  for (const queueItem of execution.queuedImmediates) {
    if (queueItem.isCleared) {
      continue
    }
    scheduleQueuedImmediateAsNativeImmediate(queueItem)
  }
  execution.queuedImmediates.length = 0

  // Don't reset `pendingNextTicks` -- it will reset to 0 on its own as the nextTicks execute.
  // If we set it to 0 here while we still have pending ticks, they'd decrement it below 0.

  throw error
}

function scheduleQueuedImmediateAsNativeImmediate(queueItem: ActiveQueueItem) {
  const { callback, args, immediateObject } = queueItem
  const hasRef = immediateObject[INTERNALS].hasRef

  clearQueueItem(queueItem)

  const nativeImmediate =
    args !== null
      ? originalSetImmediate(callback, ...args)
      : originalSetImmediate(callback)

  if (!hasRef) {
    nativeImmediate.unref()
  }

  // Make our fake immediate object proxy all relevant operations
  // (clearing, ref(), unref(), hasRef()) to the actual native immediate.
  proxyQueuedImmediateToNativeImmediate(immediateObject, nativeImmediate)
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
  if (currentExecution === null) {
    return originalNextTick.apply(
      null,
      // @ts-expect-error: this is valid, but typescript doesn't get it
      arguments
    )
  }

  if (arguments.length === 0 || typeof arguments[0] !== 'function') {
    // Let the original nextTick error for invalid arguments
    // so that we don't have to mirror the error message.
    originalNextTick.apply(
      null,
      // @ts-expect-error: explicitly passing arguments that we know are invalid
      arguments
    )

    // We expect the above call to throw. If it didn't, something's broken.
    bail(
      currentExecution,
      new InvariantError(
        'Expected process.nextTick to reject invalid arguments'
      )
    )
  }

  debug?.(
    `scheduler :: process.nextTick called (previous pending: ${pendingNextTicks})`
  )

  const callback: (...args: any[]) => any = arguments[0]
  const args: any[] | null =
    arguments.length > 1 ? Array.prototype.slice.call(arguments, 1) : null

  pendingNextTicks += 1
  return originalNextTick(safelyRunNextTickCallback, callback, args)
}

function safelyRunNextTickCallback(
  callback: (...args: any[]) => any,
  args: any[] | null
) {
  pendingNextTicks -= 1
  debug?.(
    `scheduler :: process.nextTick executing (still pending: ${pendingNextTicks})`
  )

  // Synchronous errors in nextTick break out of `processTicksAndRejections` and cause us
  // to move on to the next timer without having executed the whole nextTick queue,
  // which breaks our entire scheduling mechanism. See `performWork` for more details.
  try {
    if (args !== null) {
      callback.apply(null, args)
    } else {
      callback()
    }
  } catch (err) {
    // We want to make sure `nextTick` is cheap, so unlike `performWork`,
    // we only queue the microtask if an error actually occurs.
    // This (observably) changes the timing of `uncaughtException` even more,
    // because it'll run after microtasks queued from the nextTick,
    // but hopefully this is niche enough to not affect any real world code.
    queueMicrotask(() => {
      debug?.(`scheduler :: rethrowing sync error from nextTick in a microtask`)
      throw err
    })
  }
}

function patchedSetImmediate<TArgs extends any[]>(
  callback: (...args: TArgs) => void,
  ...args: TArgs
): NodeJS.Immediate
function patchedSetImmediate(callback: (args: void) => void): NodeJS.Immediate
function patchedSetImmediate(): NodeJS.Immediate {
  if (currentExecution === null) {
    return originalSetImmediate.apply(
      null,
      // @ts-expect-error: this is valid, but typescript doesn't get it
      arguments
    )
  }

  if (arguments.length === 0 || typeof arguments[0] !== 'function') {
    // Let the original setImmediate error for invalid arguments
    // so that we don't have to mirror the error message.
    originalSetImmediate.apply(
      null,
      // @ts-expect-error: explicitly passing arguments that we know are invalid
      arguments
    )

    // We expect the above call to throw. If it didn't, something's broken.
    bail(
      currentExecution,
      new InvariantError('Expected setImmediate to reject invalid arguments')
    )
  }

  const callback: (...args: any[]) => any = arguments[0]
  const args: any[] | null =
    arguments.length > 1 ? Array.prototype.slice.call(arguments, 1) : null

  // Normally, Node would capture and propagate the async context to the immediate.
  // We'll be running it on our own queue, so we need to propagate it ourselves.
  const callbackWithAsyncContext = bindSnapshot(callback)

  const immediateObject = new NextImmediate()

  const queueItem: ActiveQueueItem = {
    isCleared: false,
    callback: callbackWithAsyncContext,
    args,
    immediateObject,
  }
  currentExecution.queuedImmediates.push(queueItem)

  immediateObject[INTERNALS].queueItem = queueItem

  return immediateObject
}

function patchedSetImmediatePromise<T = void>(
  value: T,
  options?: import('node:timers').TimerOptions
): Promise<T> {
  if (currentExecution === null) {
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

    // Unref-ing only really has an observable effect if we bail out to a native immediate,
    // but we do it for completeness
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

patchedSetImmediate[promisify.custom] = patchedSetImmediatePromise

const patchedClearImmediate = (
  immediateObject: NodeJS.Immediate | undefined
) => {
  // NOTE: we defensively check for patched immediates even if we're not
  // currently capturing immediates, because the objects returned from
  // the patched setImmediate can be kept around for arbitrarily long.
  // As an optimization, we only do this if the patch was enabled at least once --
  // otherwise, no patched objects could've been created.
  if (
    wasEnabledAtLeastOnce &&
    immediateObject &&
    typeof immediateObject === 'object' &&
    INTERNALS in immediateObject
  ) {
    ;(immediateObject as NextImmediate)[Symbol.dispose]()
  } else {
    originalClearImmediate(immediateObject)
  }
}

//========================================================

const INTERNALS: unique symbol = Symbol.for('next.Immediate.internals')

type NextImmediateInternals =
  | {
      /** Stored to reflect `ref()`/`unref()` calls, but has no effect otherwise */
      hasRef: boolean
      queueItem: ActiveQueueItem | null
      nativeImmediate: null
    }
  | {
      hasRef: null
      queueItem: null
      nativeImmediate: NodeJS.Immediate
    }

function proxyQueuedImmediateToNativeImmediate(
  immediateObject: NextImmediate,
  nativeImmediate: NodeJS.Immediate
) {
  immediateObject[INTERNALS].hasRef = null
  immediateObject[INTERNALS].queueItem = null
  immediateObject[INTERNALS].nativeImmediate = nativeImmediate
}

/** Makes sure that we're implementing all the public `Immediate` methods */
interface NativeImmediate extends NodeJS.Immediate {}

/** Implements a shim for the native `Immediate` class returned by `setImmediate` */
class NextImmediate implements NativeImmediate {
  [INTERNALS]: NextImmediateInternals = {
    queueItem: null,
    hasRef: true,
    nativeImmediate: null,
  }
  hasRef() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      return internals.hasRef
    } else if (internals.nativeImmediate) {
      return internals.nativeImmediate.hasRef()
    } else {
      // if we're no longer queued (cleared or executed), hasRef is always false
      return false
    }
  }
  ref() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      internals.hasRef = true
    } else if (internals.nativeImmediate) {
      internals.nativeImmediate.ref()
    }
    return this
  }
  unref() {
    const internals = this[INTERNALS]
    if (internals.queueItem) {
      internals.hasRef = false
    } else if (internals.nativeImmediate) {
      internals.nativeImmediate.unref()
    }
    return this
  }

  /**
   * Node invokes `_onImmediate` when an immediate is executed:
   * https://github.com/nodejs/node/blob/42d363205715ffa5a4a6d90f4be1311487053d65/lib/internal/timers.js#L504
   * It's visible on the public types, so we want to have it here for parity, but it's a noop.
   * */
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
      internals.nativeImmediate[Symbol.dispose]()
    }
  }
}

// ==========================================

const debug =
  process.env.NEXT_DEBUG_IMMEDIATES !== '1'
    ? undefined
    : (...args: any[]) => {
        if (process.env.NEXT_RUNTIME === 'edge') {
          throw new InvariantError(
            'Fast setImmediate is not available in the edge runtime.'
          )
        } else {
          const { inspect } = require('node:util') as typeof import('node:util')
          const { writeFileSync } =
            require('node:fs') as typeof import('node:fs')

          let logLine =
            args
              .map((arg) =>
                typeof arg === 'string' ? arg : inspect(arg, { colors: true })
              )
              .join(' ') + '\n'

          logLine = '\x1B[2m' + logLine + '\x1B[22m' // styleText('dim', logLine)
          writeFileSync(process.stdout.fd, logLine)
        }
      }

// ==========================================

install()
