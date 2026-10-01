/**
 * Marks a resolved promise as fulfilled the same way React does once it has
 * tracked it, so that `use()` can unwrap it synchronously without suspending.
 *
 * In the browser, params and searchParams are always known by the time they're
 * rendered. If `use()` had to wait for a microtask, an update that isn't a
 * Transition would hide the already visible content behind the nearest Suspense
 * fallback.
 */
export function markPromiseAsFulfilled<T>(promise: Promise<T>, value: T): void {
  const fulfilledPromise = promise as Promise<T> & {
    status: 'fulfilled'
    value: T
  }
  fulfilledPromise.status = 'fulfilled'
  fulfilledPromise.value = value
}
