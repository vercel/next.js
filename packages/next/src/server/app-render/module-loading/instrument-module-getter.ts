/**
 * Wraps a module getter from the generated loader tree code so that the
 * result of an async module (e.g. due to a top-level await) is tracked as a
 * pending import, which the cache warming phase of a prerender waits for.
 * Both bundlers emit this around every module getter in the loader tree.
 */
export function instrumentModuleGetter<TModule>(
  getter: () => TModule
): () => TModule {
  if (
    process.env.NEXT_RUNTIME === 'edge' ||
    !process.env.__NEXT_CACHE_COMPONENTS
  ) {
    // The tracking is only consumed when prerendering with Cache Components,
    // which is not supported in the edge runtime (and the tracking relies on
    // Node.js APIs).
    return getter
  } else {
    return () => {
      const { trackPendingImport } =
        require('./track-module-loading.external') as typeof import('./track-module-loading.external')

      const exportsOrPromise = getter()
      trackPendingImport(exportsOrPromise)
      return exportsOrPromise
    }
  }
}
