// An internal module to expose the "waitUntil" API to Edge SSR and Edge Route Handler functions.
// This is highly experimental and subject to change.

// We still need a global key to bypass Webpack's layering of modules.
const GLOBAL_KEY = Symbol.for('__next_internal_waitUntil__')

const state: {
  waitUntilCounter: number
  waitUntilResolve: () => void
  waitUntilPromise: Promise<void> | null
} =
  // @ts-ignore
  globalThis[GLOBAL_KEY] ||
  // @ts-ignore
  (globalThis[GLOBAL_KEY] = {
    waitUntilCounter: 0,
    waitUntilResolve: undefined,
    waitUntilPromise: null,
  })

// No matter how many concurrent requests are being handled, we want to make sure
// that the final promise is only resolved once all of the waitUntil promises have
// settled.
function resolveOnePromise() {
  state.waitUntilCounter--
  if (state.waitUntilCounter === 0) {
    state.waitUntilResolve()
    state.waitUntilPromise = null
  }
}

export function internal_getCurrentFunctionWaitUntil() {
  return state.waitUntilPromise
}

export function internal_runWithWaitUntil<T>(fn: () => T): T {
  const result = fn()
  if (
    result &&
    typeof result === 'object' &&
    'then' in result &&
    'finally' in result &&
    typeof result.then === 'function' &&
    typeof result.finally === 'function'
  ) {
    if (!state.waitUntilCounter) {
      // Create the promise for the next batch of waitUntil calls.
      state.waitUntilPromise = new Promise<void>((resolve) => {
        state.waitUntilResolve = resolve
      })
    }
    state.waitUntilCounter++
    return result.finally(() => {
      resolveOnePromise()
    })
  }

  return result
}
