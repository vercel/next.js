// This module simulates a realistic migration hazard. The documented "preload"
// pattern (see the "Preloading data" section of the
// caching-without-cache-components guide in the Next.js docs) wraps the loader
// in `React.cache`, so its store is tied to the ALS snapshot — `'use cache'`
// bodies run in a clean snapshot and miss, re-executing the loader in cache
// scope. That path is safe during migration.
//
// What's modeled here is the common-in-the-wild variant that uses a
// module-scoped `Map` instead of `React.cache`. The map lives above ALS, so a
// `'use cache'` body joining it reuses the outer-scope promise (request scope
// or prerender scope) — a promise that was never meant to resolve for the
// cache:
//   - During prerendering, an uncached fetch in the outer scope returns a
//     hanging promise that intentionally never resolves.
//   - In dev, the outer fetch is parked on the Dynamic stage, which can't
//     advance until the cache fills. The cache awaits the outer fetch via the
//     shared loader, so neither can make progress.
// In both cases, the cache never fills and times out.
const pendingFetches = new Map<string, Promise<Response>>()

export function getData(url: string): Promise<Response> {
  let promise = pendingFetches.get(url)
  if (!promise) {
    promise = fetch(url)
    pendingFetches.set(url, promise)
    promise.then(
      () => pendingFetches.delete(url),
      () => pendingFetches.delete(url)
    )
  }
  return promise
}

// "Preload" primes the shared loader without awaiting so later callers reuse
// the stored promise.
export function preload(url: string): void {
  void getData(url)
}
