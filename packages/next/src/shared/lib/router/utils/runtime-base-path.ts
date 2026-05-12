import { createAsyncLocalStorage } from '../../../../server/app-render/async-local-storage'

// Client-side: a single module-scoped value, hydrated from
// `__NEXT_DATA__.basePath` during client bootstrap. The browser only ever
// renders one document at a time, so a single mutable value is enough.
let clientBasePath = ''

// Server-side: a per-request value held in AsyncLocalStorage so concurrent
// renders don't see each other's basePath. `createAsyncLocalStorage()`
// returns a no-op implementation in environments without `AsyncLocalStorage`
// (e.g. browsers), and `getStore()` returns `undefined` there — the client
// falls through to `clientBasePath`.
const runtimeBasePathStorage = createAsyncLocalStorage<{ basePath: string }>()

/**
 * Returns the basePath that should be applied to URLs at this moment.
 *
 * On the server, this is the value the current request was rendered with
 * (set via `runWithRuntimeBasePath`). On the client, this is the value
 * hydrated from `__NEXT_DATA__.basePath`.
 *
 * Only meaningful when `experimental.runtimeBasePath` is enabled.
 */
export function getRuntimeBasePath(): string {
  const store = runtimeBasePathStorage.getStore()
  if (store) return store.basePath
  return clientBasePath
}

/**
 * Sets the client-side runtime basePath. Should be called exactly once
 * during client bootstrap, before the router is created.
 */
export function setClientRuntimeBasePath(basePath: string): void {
  clientBasePath = basePath
}

/**
 * Runs `fn` with the given basePath as the active runtime basePath.
 * Used on the server to scope a render to a per-request basePath.
 */
export function runWithRuntimeBasePath<R>(
  basePath: string,
  fn: () => R
): R {
  return runtimeBasePathStorage.run({ basePath }, fn)
}
