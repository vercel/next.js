// An internal module to expose the "waitUntil" API to Edge SSR and Edge Route Handler functions.
// This is highly experimental and subject to change.

let currentWaitUntilCounter = 0
let currentWaitUntilResolve: () => void
let currentWaitUntilPromise: null | Promise<void> = null

// No matter how many concurrent requests are being handled, we want to make sure
// that the final promise is only resolved once all of the waitUntil promises have
// settled.
function resolveOnePromise() {
  currentWaitUntilCounter--
  if (currentWaitUntilCounter === 0) {
    currentWaitUntilResolve()
  }
}

export function internal_getCurrentFunctionWaitUntil() {
  return currentWaitUntilPromise
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
    if (!currentWaitUntilCounter) {
      // Create the promise for the next batch of waitUntil calls.
      currentWaitUntilPromise = new Promise<void>((resolve) => {
        currentWaitUntilResolve = resolve
      })
    }
    currentWaitUntilCounter++
    return result.finally(() => {
      resolveOnePromise()
    })
  }

  return result
}
