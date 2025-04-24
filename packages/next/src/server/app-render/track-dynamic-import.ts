import { InvariantError } from '../../shared/lib/invariant-error'
import { isThenable } from '../../shared/lib/is-thenable'
import type { CacheSignal } from './cache-signal'
import {
  trackPendingAsyncImport,
  subscribeToPendingModules,
} from './track-module-loading.external'

/**
 * in DynamicIO, `import(...)` will be transformed into `trackDynamicImport(import(...))`.
 * A dynamic import is essentially a cached async function, except it's cached by the module system.
 *
 * The promises are tracked globally regardless of if the `import()` happens inside a render or outside of it.
 * When rendering, we can make the `cacheSignal` wait for all pending promises via `trackPendingTopLevelModules`.
 * */
export function trackDynamicImport<TExports extends Record<string, any>>(
  modulePromise: Promise<TExports>
): Promise<TExports> {
  if (!isThenable(modulePromise)) {
    // We're expecting `import()` to always return a promise. If it's not, something's very wrong.
    throw new InvariantError('Expected the argument to be a promise')
  }

  // Even if we're inside render and have a `cacheSignal` available, always track the promise globally.
  // The `import()` promise might be cached in userspace,
  // and if multiple prerenders use it, we have to wait for it in all of them.
  // (the `cacheSignal.trackRead()` above will work for the first render that invokes the import,
  //  but subsequent ones that re-use the promise wouldn't get that)
  trackPendingAsyncImport(modulePromise)

  return modulePromise
}

/**
 * A top-level dynamic import or a chunk load may reveal more caches,
 * so if we see one, we make the `CacheSignal` wait for it to complete.
 * (`trackDynamicImport` already tracks these if they happen in a component,
 *  but we also need to do handle imports that happen outside of render.)
 *
 * We're not using `waitForPendingModules`,
 * because we might start and finish multiple batches of module loads while waiting for caches,
 * and `waitForPendingModules` would resolve after the first batch.
 * Instead, the import/chunk-load tracking mechanism will notify the cache signal
 * of each import/chunk-load that happens, and we'll delay `cacheReady` until all of them are done.
 *
 * There's a potential race if the page does some imports at the top level with a tasky delay:
 *
 * ```tsx
 *   const modulePromise = createPromiseWithResolvers();
 *
 *   void (async () => {
 *     const id = await uncachedFetch(); // tasky
 *     return import(`./foo/${id}`);
 *   })().then(
 *     (mod) => modulePromise.resolve(mod),
 *     (err) => modulePromise.reject(err)
 *   );
 *
 *   export default async function Page() {
 *     const mod = await modulePromise
 *     ...
 *   }
 * ```
 * In that case, if the `CacheSignal` wasn't already waiting for any other caches when the `import()` is called,
 * It may have already resolved `cacheReady()`, so we'd miss this in the prospective render
 * and likely fail in the actual prerender.
 */
export function trackPendingAsyncImports(cacheSignal: CacheSignal) {
  const unsubscribe = subscribeToPendingModules((promise) =>
    cacheSignal.trackRead(promise)
  )
  cacheSignal.cacheReady().then(unsubscribe)
}
