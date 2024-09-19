import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../../server/web/spec-extension/adapters/headers'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'
import {
  prerenderAsyncStorage,
  type PrerenderStore,
} from '../app-render/prerender-async-storage.external'
import {
  postponeWithTracking,
  abortOnSynchronousDynamicDataAccess,
  interruptStaticGeneration,
  trackDynamicDataInDynamicRender,
} from '../app-render/dynamic-rendering'
import { getExpectedRequestStore } from '../../client/components/request-async-storage.external'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

/**
 * In this version of Next.js `headers()` returns a Promise however you can still reference the properties of the underlying Headers instance
 * synchronously to facilitate migration. The `UnsafeUnwrappedHeaders` type is added to your code by a codemod that attempts to automatically
 * updates callsites to reflect the new Promise return type. There are some cases where `headers()` cannot be automatically converted, namely
 * when it is used inside a synchronous function and we can't be sure the function can be made async automatically. In these cases we add an
 * explicit type case to `UnsafeUnwrappedHeaders` to enable typescript to allow for the synchronous usage only where it is actually necessary.
 *
 * You should should update these callsites to either be async functions where the `headers()` value can be awaited or you should call `headers()`
 * from outside and await the return value before passing it into this function.
 *
 * You can find instances that require manual migration by searching for `UnsafeUnwrappedHeaders` in your codebase or by search for a comment that
 * starts with:
 *
 * ```
 * // TODO [sync-headers-usage]
 * ```
 * In a future version of Next.js `headers()` will only return a Promise and you will not be able to access the underlying Headers instance
 * without awaiting the return value first. When this change happens the type `UnsafeUnwrappedHeaders` will be updated to reflect that is it no longer
 * usable.
 *
 * This type is marked deprecated to help identify it as target for refactoring away.
 *
 * @deprecated
 */
export type UnsafeUnwrappedHeaders = ReadonlyHeaders

/**
 * This function allows you to read the HTTP incoming request headers in
 * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
 * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations),
 * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) and
 * [Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware).
 *
 * Read more: [Next.js Docs: `headers`](https://nextjs.org/docs/app/api-reference/functions/headers)
 */
export function headers(): Promise<ReadonlyHeaders> {
  const requestStore = getExpectedRequestStore('headers')
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()
  const prerenderStore = prerenderAsyncStorage.getStore()

  if (staticGenerationStore) {
    if (staticGenerationStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // headers object without tracking
      const underlyingHeaders = HeadersAdapter.seal(new Headers({}))
      return makeUntrackedExoticHeaders(underlyingHeaders)
    }

    if (staticGenerationStore.isUnstableCacheCallback) {
      throw new Error(
        `Route ${staticGenerationStore.route} used "headers" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "headers" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    } else if (staticGenerationStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${staticGenerationStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (prerenderStore) {
      // We are in PPR and/or dynamicIO mode and prerendering

      if (prerenderStore.controller || prerenderStore.cacheSignal) {
        // We use the controller and cacheSignal as an indication we are in dynamicIO mode.
        // When resolving headers for a prerender with dynamic IO we return a forever promise
        // along with property access tracked synchronous headers.

        // We don't track dynamic access here because access will be tracked when you access
        // one of the properties of the headers object.
        return makeDynamicallyTrackedExoticHeaders(
          staticGenerationStore.route,
          prerenderStore
        )
      } else {
        // We are prerendering with PPR. We need track dynamic access here eagerly
        // to keep continuity with how headers has worked in PPR without dynamicIO.
        // TODO consider switching the semantic to throw on property access instead
        postponeWithTracking(
          staticGenerationStore.route,
          'headers',
          prerenderStore.dynamicTracking
        )
      }
    } else if (staticGenerationStore.isStaticGeneration) {
      // We are in a legacy static generation mode while prerendering
      // We track dynamic access here so we don't need to wrap the headers in
      // individual property access tracking.
      interruptStaticGeneration('headers', staticGenerationStore)
    }
    // We fall through to the dynamic context below but we still track dynamic access
    // because in dev we can still error for things like using headers inside a cache context
    trackDynamicDataInDynamicRender(staticGenerationStore)
  }

  if (process.env.NODE_ENV === 'development') {
    return makeUntrackedExoticHeadersWithDevWarnings(
      requestStore.headers,
      staticGenerationStore?.route
    )
  } else {
    return makeUntrackedExoticHeaders(requestStore.headers)
  }
}

interface CacheLifetime {}
const CachedHeaders = new WeakMap<CacheLifetime, Promise<ReadonlyHeaders>>()

function hangForever() {}
function makeDynamicallyTrackedExoticHeaders(
  route: string,
  prerenderStore: PrerenderStore
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(prerenderStore)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const underlying = HeadersAdapter.seal(new Headers({}))
  const promise = new Promise<ReadonlyHeaders>(hangForever)
  CachedHeaders.set(prerenderStore, promise)

  const controller = prerenderStore.controller
  const dynamicTracking = prerenderStore.dynamicTracking

  Object.defineProperties(promise, {
    append: {
      value: function append() {
        const expression = `headers().append(${describeNameArg(arguments[0])}, ...)`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.append.apply(underlying, arguments as any)
      },
    },
    delete: {
      value: function _delete() {
        const expression = `headers().delete(${describeNameArg(arguments[0])})`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.delete.apply(underlying, arguments as any)
      },
    },
    get: {
      value: function get() {
        const expression = `headers().get(${describeNameArg(arguments[0])})`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.get.apply(underlying, arguments as any)
      },
    },
    has: {
      value: function has() {
        const expression = `headers().has(${describeNameArg(arguments[0])})`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.has.apply(underlying, arguments as any)
      },
    },
    set: {
      value: function set() {
        const expression = `headers().set(${describeNameArg(arguments[0])}, ...)`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.set.apply(underlying, arguments as any)
      },
    },
    getSetCookie: {
      value: function getSetCookie() {
        const expression = `headers().getSetCookie()`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.getSetCookie.apply(underlying, arguments as any)
      },
    },
    forEach: {
      value: function forEach() {
        const expression = `headers().forEach(...)`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.forEach.apply(underlying, arguments as any)
      },
    },
    keys: {
      value: function keys() {
        const expression = `headers().keys()`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.keys.apply(underlying, arguments as any)
      },
    },
    values: {
      value: function values() {
        const expression = `headers().values()`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.values.apply(underlying, arguments as any)
      },
    },
    entries: {
      value: function entries() {
        const expression = `headers().entries()`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.entries.apply(underlying, arguments as any)
      },
    },
    [Symbol.iterator]: {
      value: function () {
        const expression = 'headers()[Symbol.iterator]()'
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying[Symbol.iterator].apply(underlying, arguments as any)
      },
    },
  })

  return promise
}

function makeUntrackedExoticHeaders(
  underlying: ReadonlyHeaders
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(underlying)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = Promise.resolve(underlying)
  CachedHeaders.set(underlying, promise)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlying,
      writable: true,
    },
    append: {
      value: underlying.append.bind(underlying),
    },
    delete: {
      value: underlying.delete.bind(underlying),
    },
    get: {
      value: underlying.get.bind(underlying),
    },
    has: {
      value: underlying.has.bind(underlying),
    },
    set: {
      value: underlying.set.bind(underlying),
    },
    getSetCookie: {
      value: underlying.getSetCookie.bind(underlying),
    },
    forEach: {
      value: underlying.forEach.bind(underlying),
    },
    keys: {
      value: underlying.keys.bind(underlying),
    },
    values: {
      value: underlying.values.bind(underlying),
    },
    entries: {
      value: underlying.entries.bind(underlying),
    },
    [Symbol.iterator]: {
      value: underlying[Symbol.iterator].bind(underlying),
    },
  })

  return promise
}

function makeUntrackedExoticHeadersWithDevWarnings(
  underlying: ReadonlyHeaders,
  route?: string
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(underlying)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = Promise.resolve(underlying)
  CachedHeaders.set(underlying, promise)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlying,
      writable: true,
    },
    append: {
      value: function append() {
        const expression = `headers().append(${describeNameArg(arguments[0])}, ...)`
        warnForSyncAccess(route, expression)
        return underlying.append.apply(underlying, arguments as any)
      },
    },
    delete: {
      value: function _delete() {
        const expression = `headers().delete(${describeNameArg(arguments[0])})`
        warnForSyncAccess(route, expression)
        return underlying.delete.apply(underlying, arguments as any)
      },
    },
    get: {
      value: function get() {
        const expression = `headers().get(${describeNameArg(arguments[0])})`
        warnForSyncAccess(route, expression)
        return underlying.get.apply(underlying, arguments as any)
      },
    },
    has: {
      value: function has() {
        const expression = `headers().has(${describeNameArg(arguments[0])})`
        warnForSyncAccess(route, expression)
        return underlying.has.apply(underlying, arguments as any)
      },
    },
    set: {
      value: function set() {
        const expression = `headers().set(${describeNameArg(arguments[0])}, ...)`
        warnForSyncAccess(route, expression)
        return underlying.set.apply(underlying, arguments as any)
      },
    },
    getSetCookie: {
      value: function getSetCookie() {
        const expression = `headers().getSetCookie()`
        warnForSyncAccess(route, expression)
        return underlying.getSetCookie.apply(underlying, arguments as any)
      },
    },
    forEach: {
      value: function forEach() {
        const expression = `headers().forEach(...)`
        warnForSyncAccess(route, expression)
        return underlying.forEach.apply(underlying, arguments as any)
      },
    },
    keys: {
      value: function keys() {
        const expression = `headers().keys()`
        warnForSyncAccess(route, expression)
        return underlying.keys.apply(underlying, arguments as any)
      },
    },
    values: {
      value: function values() {
        const expression = `headers().values()`
        warnForSyncAccess(route, expression)
        return underlying.values.apply(underlying, arguments as any)
      },
    },
    entries: {
      value: function entries() {
        const expression = `headers().entries()`
        warnForSyncAccess(route, expression)
        return underlying.entries.apply(underlying, arguments as any)
      },
    },
    [Symbol.iterator]: {
      value: function () {
        warnForSyncIteration(route)
        return underlying[Symbol.iterator].apply(underlying, arguments as any)
      },
    },
  })

  return promise
}

function describeNameArg(arg: unknown) {
  return typeof arg === 'string' ? `'${arg}'` : '...'
}

function warnForSyncIteration(route?: string) {
  const prefix = route ? ` In route ${route} ` : ''
  console.error(
    `${prefix}headers were iterated implicitly with something like \`for...of headers())\` or \`[...headers()]\`, or explicitly with \`headers()[Symbol.iterator]()\`. \`headers()\` now returns a Promise and the return value should be awaited before attempting to iterate over headers. In this version of Next.js iterating headers without awaiting first is still supported to facilitate migration but in a future version you will be required to await the result. If this \`headers()\` use is inside an async function await the return value before accessing attempting iteration. If this use is inside a synchronous function then convert the function to async or await the call from outside this function and pass the result in.`
  )
}

function warnForSyncAccess(route: undefined | string, expression: string) {
  const prefix = route ? ` In route ${route} a ` : 'A '
  console.error(
    `${prefix}header property was accessed directly with \`${expression}\`. \`headers()\` now returns a Promise and the return value should be awaited before accessing properties of the underlying headers instance. In this version of Next.js direct access to \`${expression}\` is still supported to facilitate migration but in a future version you will be required to await the result. If this \`headers()\` use is inside an async function await the return value before accessing attempting iteration. If this use is inside a synchronous function then convert the function to async or await the call from outside this function and pass the result in.`
  )
}
