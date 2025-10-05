import { InvariantError } from '../../../shared/lib/invariant-error'
import { isThenable } from '../../../shared/lib/is-thenable'
import { trackPendingImport } from './track-module-loading.external'

/**
 * in CacheComponents, `import(...)` will be transformed into `trackDynamicImport(import(...))`.
 * A dynamic import is essentially a cached async function, except it's cached by the module system.
 *
 * The promises are tracked globally regardless of if the `import()` happens inside a render or outside of it.
 * When rendering, we can make the `cacheSignal` wait for all pending promises via `trackPendingModules`.
 * */
export function trackDynamicImport<TExports extends Record<string, any>>(
  modulePromise: Promise<TExports>
): Promise<TExports> {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      "Dynamic imports should not be instrumented in the edge runtime, because `cacheComponents` doesn't support it"
    )
  }

  if (!isThenable(modulePromise)) {
    // We're expecting `import()` to always return a promise. If it's not, something's very wrong.
    throw new InvariantError(
      '`trackDynamicImport` should always receive a promise. Something went wrong in the dynamic imports transform.'
    )
  }

  // Even if we're inside a prerender and have `workUnitStore.cacheSignal`, we always track the promise globally.
  // (i.e. via the global `moduleLoadingSignal` that `trackPendingImport` uses internally).
  //
  // We do this because the `import()` promise might be cached in userspace:
  // (which is quite common for e.g. lazy initialization in libraries)
  //
  //   let promise;
  //   function doDynamicImportOnce() {
  //     if (!promise) {
  //       promise = import("...");
  //       // transformed into:
  //       // promise = trackDynamicImport(import("..."));
  //     }
  //     return promise;
  //   }
  //
  // If multiple prerenders (e.g. multiple pages) depend on `doDynamicImportOnce`,
  // we have to wait for the import *in all of them*.
  // If we only tracked it using `workUnitStore.cacheSignal.trackRead()`,
  // then only the first prerender to call `doDynamicImportOnce` would wait --
  // Subsequent prerenders would re-use the existing `promise`,
  // and `trackDynamicImport` wouldn't be called again in their scope,
  // so their respective CacheSignals wouldn't wait for the promise.
  trackPendingImport(modulePromise)

  return modulePromise
}
