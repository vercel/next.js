import type { SearchParams } from './search-params'
import { createServerSearchParamsForServerPage } from './search-params'
import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  workUnitAsyncStorage,
  type WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'
import {
  getSegmentReferenceValue,
  getSegmentVaryParamsAccumulator,
} from '../app-render/segment-store'
// Resolves to `undefined` outside the experimental React channel (see the
// shim); the call below is gated on `__NEXT_EXPERIMENTAL_PARAMS_BY_REFERENCE`,
// which implies that channel, so the import is the real API where it runs.
// This react-server-dom import is why this module must only ever be reached
// through the generated page entry / the RSC-layer entry base — never imported
// by the pre-compiled runtime bundle. Runtime callers that need to *create* a
// reference reach `createSearchParamsReference` through the entry base
// (`componentMod`) at runtime, not by importing this module.
import { registerServerObjectReference } from '../../build/webpack/loaders/next-flight-loader/server-object-reference'

/**
 * Server params references: `searchParams` (and eventually `params`) are
 * passed to route components as a stable per-page-segment object exported by
 * the framework-generated app page entry, instead of by value. Reading the
 * object resolves the real values against whichever request observes it, and —
 * when registered — it round-trips through the client as an opaque Server
 * Object Reference.
 *
 * The reference-proxy machinery (`createReferenceProxy`) lives here and is
 * generic, so a future `params` reference reuses it with its own
 * `dereference…` resolver; only the value-specific resolution is factored out
 * into the runtime-safe `search-params.ts`.
 */

/**
 * Builds a `Promise`-shaped Proxy over a request-scoped value. Every
 * observation resolves against the ambient work unit store via `resolve`, and
 * the result is memoized on that store's segment store (see
 * `getSegmentReferenceValue`) so that React's `use()` protocol — which writes
 * `status`/`value` onto the thenable and re-reads them across suspends —
 * always sees the same underlying promise (the staged Cache Components
 * resolver returns a fresh promise per call, so the memo is required for
 * correctness, not just perf). The reference is its own segment key, so its
 * resolved value lives alongside its vary-params accumulator in one
 * per-(request, segment) container, and never leaks between requests.
 *
 * The object is a single module-lifetime value, so it can't capture any one
 * request's values — hence the inert target and the per-observation
 * forwarding. React's `use()` bookkeeping writes (`status`/`value`/`reason`)
 * are redirected to the per-request promise too, so they never accumulate on
 * the shared object and leak between requests.
 */
function createReferenceProxy<T extends object>(
  resolve: (workUnitStore: WorkUnitStore, reference: object) => Promise<T>
): Promise<T> {
  function getUnderlying(): Promise<T> {
    const workUnitStore = workUnitAsyncStorage.getStore()
    if (!workUnitStore) {
      throw new Error(
        'A server params reference can only be read within the scope of a request.'
      )
    }
    return getSegmentReferenceValue(workUnitStore, reference, resolve)
  }

  // A real (inert, never-observed) promise, so the reference passes
  // `instanceof Promise` and inherits `Promise.prototype`. Registration
  // metadata (`$$typeof`/`$$id`), if any, is defined on it by the wrapper;
  // React Flight reads `$$typeof` to serialize the reference as `$H` before it
  // ever probes `then`.
  const inertTarget: Promise<T> = Promise.resolve({} as T)

  const reference: Promise<T> = new Proxy(inertTarget, {
    get(target, prop, receiver) {
      if (Object.hasOwn(target, prop)) {
        // Registration metadata (`$$typeof`/`$$id`) written onto the target.
        // It identifies the reference and must resolve from the target, not a
        // request's value — Flight reads `$$typeof` to serialize the reference
        // as `$H` before it ever probes `then`.
        return ReflectAdapter.get(target, prop, receiver)
      }
      // Everything else is an observation — awaiting, `use()` (including
      // reading back the bookkeeping the set trap wrote), Flight probing it as
      // a thenable, inspection, and so on. Forward it to the per-request
      // promise; there's no need to enumerate which properties matter, since
      // React instruments the inner promise via `then`/`status`/`value` and
      // reading the rest from it is harmless.
      const underlying = getUnderlying()
      return ReflectAdapter.get(underlying, prop, underlying)
    },
    set(target, prop, value, receiver) {
      if (prop === 'status' || prop === 'value' || prop === 'reason') {
        // React's `use()` thenable bookkeeping. Redirect to the per-request
        // underlying promise so the shared reference never carries one
        // request's resolution into the next.
        const underlying = getUnderlying()
        return Reflect.set(underlying, prop, value)
      }
      return ReflectAdapter.set(target, prop, value, receiver)
    },
  })

  return reference
}

/**
 * Builds a page segment's `searchParams` object: the generic reference proxy
 * wired to the searchParams resolver. Each observation resolves the ambient
 * scope's search params (`createServerSearchParamsForServerPage`, which reads
 * them from the store), recording access into this segment's vary-params
 * accumulator. This is the unregistered core — awaiting it resolves the
 * current request's values and passing it to a client component serializes it
 * by value like any promise. `registerSearchParamsServerReference` wraps it to
 * additionally register it as a Server Object Reference (the only thing that
 * makes it serialize *by reference*).
 */
export function createSearchParamsReference(): Promise<SearchParams> {
  return createReferenceProxy((workUnitStore, reference) =>
    createServerSearchParamsForServerPage(
      getSegmentVaryParamsAccumulator(workUnitStore, reference)
    )
  )
}

/**
 * Wraps `createSearchParamsReference` to register the object as a Server
 * Object Reference (mirroring how the SWC transform registers `'use server'`
 * functions with `registerServerReference`):
 *
 * - Rendering it into a client component serializes it by reference (`$H`).
 * - The client can only round-trip it back to the server (opaque token).
 * - `decodeReply` resolves the id through the server reference manifest back
 *   to this export, without calling it.
 *
 * Called by the generated app page entry with the segment's reference id.
 */
export function registerSearchParamsServerReference(
  id: string
): Promise<SearchParams> {
  const reference = createSearchParamsReference()

  // Gated on this mechanism's flag, not the experimental React channel: other
  // features also enable that channel, but registration (and the by-reference
  // serialization it enables) must happen only when this feature is on. The
  // flag forces the experimental channel, so when this is true the
  // `registerServerObjectReference` import above is the real API; otherwise
  // the whole branch is eliminated (and the import resolves to `undefined`).
  if (process.env.__NEXT_EXPERIMENTAL_PARAMS_BY_REFERENCE) {
    registerServerObjectReference(reference, id, null)
  }

  return reference
}
