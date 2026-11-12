const SAFE_TIMERS_SYMBOL = Symbol('vitest:SAFE_TIMERS')

export interface SafeTimers {
  // node.js timers
  nextTick?: (cb: () => void) => void
  setImmediate?: {
    <TArgs extends any[]>(
      callback: (...args: TArgs) => void,
      ...args: TArgs
    ): any
    __promisify__: <T = void>(value?: T, options?: any) => Promise<T>
  }
  clearImmediate?: (immediateId: any) => void

  // cross-platform timers
  setTimeout: typeof setTimeout
  setInterval: typeof setInterval
  clearInterval: typeof clearInterval
  clearTimeout: typeof clearTimeout
  queueMicrotask: typeof queueMicrotask
}

export function getSafeTimers(): SafeTimers {
  const {
    setTimeout: safeSetTimeout,
    setInterval: safeSetInterval,
    clearInterval: safeClearInterval,
    clearTimeout: safeClearTimeout,
    setImmediate: safeSetImmediate,
    clearImmediate: safeClearImmediate,
    queueMicrotask: safeQueueMicrotask,
  } = (globalThis as any)[SAFE_TIMERS_SYMBOL] || globalThis

  const { nextTick: safeNextTick } =
    (globalThis as any)[SAFE_TIMERS_SYMBOL] || globalThis.process || {}

  return {
    nextTick: safeNextTick,
    setTimeout: safeSetTimeout,
    setInterval: safeSetInterval,
    clearInterval: safeClearInterval,
    clearTimeout: safeClearTimeout,
    setImmediate: safeSetImmediate,
    clearImmediate: safeClearImmediate,
    queueMicrotask: safeQueueMicrotask,
  }
}

export function setSafeTimers(): void {
  const {
    setTimeout: safeSetTimeout,
    setInterval: safeSetInterval,
    clearInterval: safeClearInterval,
    clearTimeout: safeClearTimeout,
    setImmediate: safeSetImmediate,
    clearImmediate: safeClearImmediate,
    queueMicrotask: safeQueueMicrotask,
  } = globalThis

  const { nextTick: safeNextTick } = globalThis.process || {}

  const timers = {
    nextTick: safeNextTick,
    setTimeout: safeSetTimeout,
    setInterval: safeSetInterval,
    clearInterval: safeClearInterval,
    clearTimeout: safeClearTimeout,
    setImmediate: safeSetImmediate,
    clearImmediate: safeClearImmediate,
    queueMicrotask: safeQueueMicrotask,
  }

  ;(globalThis as any)[SAFE_TIMERS_SYMBOL] = timers
}

/**
 * Returns a promise that resolves after the specified duration.
 *
 * @param timeout - Delay in milliseconds
 * @param scheduler - Timer function to use, defaults to `setTimeout`. Useful for mocked timers.
 *
 * @example
 * await delay(100)
 *
 * @example
 * // With mocked timers
 * const { setTimeout } = getSafeTimers()
 * await delay(100, setTimeout)
 */
export function delay(
  timeout: number,
  scheduler: typeof setTimeout = setTimeout
): Promise<void> {
  return new Promise((resolve) => scheduler(resolve, timeout))
}
