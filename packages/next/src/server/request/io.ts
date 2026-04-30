import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import {
  makeHangingPromise,
  makeDevtoolsIOAwarePromise,
} from '../dynamic-rendering-utils'
import { RenderStage } from '../app-render/staged-rendering'
import { throwPrerenderPPRRemovedError } from '../../shared/lib/ppr-removed-error'

// A fulfilled thenable that React can unwrap synchronously via `use()` without
// ever suspending. Reusing a single instance avoids allocating on every call.
const resolvedIOPromise: Promise<void> = Promise.resolve(undefined)
;(resolvedIOPromise as any).status = 'fulfilled'
;(resolvedIOPromise as any).value = undefined

/**
 * This function allows you to indicate that the code following it performs
 * I/O or accesses dynamic data sources such as `new Date()` or `Math.random()`.
 *
 * During prerendering it will prevent the prerender from continuing past this
 * point, creating a dynamic boundary. Inside `"use cache"` scopes or during
 * a real request it resolves immediately.
 *
 * Unlike `connection()`, `unstable_io()` does not require an actual HTTP
 * request and can be used freely inside cache scopes and client components.
 */
export function unstable_io(): Promise<void> {
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workStore && workUnitStore) {
    switch (workUnitStore.type) {
      case 'request':
        // For dev renders we instrument the promise so it will show up in
        // React Suspense Devtools and, if also doing `instant` validation,
        // ensure it resolves in the right stage for staged rendering
        // In production we just let it resolve immediately because we're doing
        // a dynamic SSR or resume render and have no need to delay anything
        // after this call
        if (process.env.NODE_ENV === 'development') {
          if (workUnitStore.asyncApiPromises) {
            return workUnitStore.asyncApiPromises.io
          }
          return makeDevtoolsIOAwarePromise(
            undefined,
            workUnitStore,
            RenderStage.Dynamic
          )
        } else if (workUnitStore.asyncApiPromises) {
          return workUnitStore.asyncApiPromises.io
        }
        return resolvedIOPromise
      case 'prerender':
      case 'prerender-client':
      case 'prerender-runtime':
        // When prerendering with Cache Components we consider `io()` to be
        // actual IO if not in a cache scope and we can avoid actually executing
        // anything after it by making it return a hanging promise.
        return makeHangingPromise(
          workUnitStore.renderSignal,
          workStore.route,
          '`unstable_io()`'
        )
      case 'prerender-ppr':
        // Dead code to be removed when we eliminate legacy ppr code
        throwPrerenderPPRRemovedError()
        break
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
      // Inside cache scopes, unstable_io() resolves immediately.
      // Caches can contain IO-dependent code like new Date() — it will
      // simply return the value at cache-fill time.
      // ...
      // intentional fallthrough
      case 'generate-static-params':
      // generateStaticParams runs at build time. There is no prerender
      // to stall so we resolve immediately.
      // ...
      // intentional fallthrough
      case 'validation-client':
      // unstable_io() is usable in client components, resolve immediately.
      // The reason we take this position is most io shielding you would do
      // in a browser is for sync IO as there aren't many non-fetch based IO
      // operations you can do in the browser that have meaningful latency.
      // So while you might use
      // ...
      // intentional fallthrough
      case 'prerender-legacy':
        // Without cache components, IO is not inherently dynamic.
        // Resolve immediately rather than interrupting static generation.
        return resolvedIOPromise
      default:
        workUnitStore satisfies never
    }
  }

  // No work store — we're outside the Next.js rendering context (e.g. in
  // a client component on the browser or in a standalone script). Resolve
  // immediately.
  return resolvedIOPromise
}
