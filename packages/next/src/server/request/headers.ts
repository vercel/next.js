import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../web/spec-extension/adapters/headers'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { getExpectedRequestStore } from '../app-render/work-unit-async-storage.external'
import {
  workUnitAsyncStorage,
  type PrerenderStoreModern,
} from '../app-render/work-unit-async-storage.external'
import {
  postponeWithTracking,
  abortAndThrowOnSynchronousRequestDataAccess,
  throwToInterruptStaticGeneration,
  trackDynamicDataInDynamicRender,
  trackSynchronousRequestDataAccessInDev,
} from '../app-render/dynamic-rendering'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { scheduleImmediate } from '../../lib/scheduler'
import { isRequestAPICallableInsideAfter } from './utils'

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
 * starts with `@next-codemod-error`.
 *
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
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workStore) {
    if (
      workUnitStore &&
      workUnitStore.phase === 'after' &&
      !isRequestAPICallableInsideAfter()
    ) {
      throw new Error(
        `Route ${workStore.route} used "headers" inside "after(...)". This is not supported. If you need this data inside an "after" callback, use "headers" outside of the callback. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/after`
      )
    }

    if (workStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // headers object without tracking
      const underlyingHeaders = HeadersAdapter.seal(new Headers({}))
      return makeUntrackedExoticHeaders(underlyingHeaders)
    }

    if (workUnitStore) {
      if (workUnitStore.type === 'cache') {
        throw new Error(
          `Route ${workStore.route} used "headers" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "headers" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
        )
      } else if (workUnitStore.type === 'unstable-cache') {
        throw new Error(
          `Route ${workStore.route} used "headers" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "headers" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
        )
      }
    }
    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      if (workUnitStore.type === 'prerender') {
        // dynamicIO Prerender
        // We don't track dynamic access here because access will be tracked when you access
        // one of the properties of the headers object.
        return makeDynamicallyTrackedExoticHeaders(
          workStore.route,
          workUnitStore
        )
      } else if (workUnitStore.type === 'prerender-ppr') {
        // PPR Prerender (no dynamicIO)
        // We are prerendering with PPR. We need track dynamic access here eagerly
        // to keep continuity with how headers has worked in PPR without dynamicIO.
        // TODO consider switching the semantic to throw on property access instead
        postponeWithTracking(
          workStore.route,
          'headers',
          workUnitStore.dynamicTracking
        )
      } else if (workUnitStore.type === 'prerender-legacy') {
        // Legacy Prerender
        // We are in a legacy static generation mode while prerendering
        // We track dynamic access here so we don't need to wrap the headers in
        // individual property access tracking.
        throwToInterruptStaticGeneration('headers', workStore, workUnitStore)
      }
    }
    // We fall through to the dynamic context below but we still track dynamic access
    // because in dev we can still error for things like using headers inside a cache context
    trackDynamicDataInDynamicRender(workStore, workUnitStore)
  }

  const requestStore = getExpectedRequestStore('headers')
  if (process.env.NODE_ENV === 'development' && !workStore?.isPrefetchRequest) {
    return makeUntrackedExoticHeadersWithDevWarnings(
      requestStore.headers,
      workStore?.route
    )
  } else {
    return makeUntrackedExoticHeaders(requestStore.headers)
  }
}

interface CacheLifetime {}
const CachedHeaders = new WeakMap<CacheLifetime, Promise<ReadonlyHeaders>>()

function makeDynamicallyTrackedExoticHeaders(
  route: string,
  prerenderStore: PrerenderStoreModern
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(prerenderStore)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = makeHangingPromise<ReadonlyHeaders>(
    prerenderStore.renderSignal,
    '`headers()`'
  )
  CachedHeaders.set(prerenderStore, promise)

  Object.defineProperties(promise, {
    append: {
      value: function append() {
        const expression = `\`headers().append(${describeNameArg(arguments[0])}, ...)\``
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    delete: {
      value: function _delete() {
        const expression = `\`headers().delete(${describeNameArg(arguments[0])})\``
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    get: {
      value: function get() {
        const expression = `\`headers().get(${describeNameArg(arguments[0])})\``
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    has: {
      value: function has() {
        const expression = `\`headers().has(${describeNameArg(arguments[0])})\``
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    set: {
      value: function set() {
        const expression = `\`headers().set(${describeNameArg(arguments[0])}, ...)\``
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    getSetCookie: {
      value: function getSetCookie() {
        const expression = '`headers().getSetCookie()`'
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    forEach: {
      value: function forEach() {
        const expression = '`headers().forEach(...)`'
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    keys: {
      value: function keys() {
        const expression = '`headers().keys()`'
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    values: {
      value: function values() {
        const expression = '`headers().values()`'
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    entries: {
      value: function entries() {
        const expression = '`headers().entries()`'
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    [Symbol.iterator]: {
      value: function () {
        const expression = '`headers()[Symbol.iterator]()`'
        const error = createHeadersAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
  } satisfies HeadersExtensions)

  return promise
}

function makeUntrackedExoticHeaders(
  underlyingHeaders: ReadonlyHeaders
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(underlyingHeaders)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = Promise.resolve(underlyingHeaders)
  CachedHeaders.set(underlyingHeaders, promise)

  Object.defineProperties(promise, {
    append: {
      value: underlyingHeaders.append.bind(underlyingHeaders),
    },
    delete: {
      value: underlyingHeaders.delete.bind(underlyingHeaders),
    },
    get: {
      value: underlyingHeaders.get.bind(underlyingHeaders),
    },
    has: {
      value: underlyingHeaders.has.bind(underlyingHeaders),
    },
    set: {
      value: underlyingHeaders.set.bind(underlyingHeaders),
    },
    getSetCookie: {
      value: underlyingHeaders.getSetCookie.bind(underlyingHeaders),
    },
    forEach: {
      value: underlyingHeaders.forEach.bind(underlyingHeaders),
    },
    keys: {
      value: underlyingHeaders.keys.bind(underlyingHeaders),
    },
    values: {
      value: underlyingHeaders.values.bind(underlyingHeaders),
    },
    entries: {
      value: underlyingHeaders.entries.bind(underlyingHeaders),
    },
    [Symbol.iterator]: {
      value: underlyingHeaders[Symbol.iterator].bind(underlyingHeaders),
    },
  } satisfies HeadersExtensions)

  return promise
}

function makeUntrackedExoticHeadersWithDevWarnings(
  underlyingHeaders: ReadonlyHeaders,
  route?: string
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(underlyingHeaders)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = new Promise<ReadonlyHeaders>((resolve) =>
    scheduleImmediate(() => resolve(underlyingHeaders))
  )

  CachedHeaders.set(underlyingHeaders, promise)

  Object.defineProperties(promise, {
    append: {
      value: function append() {
        const expression = `\`headers().append(${describeNameArg(arguments[0])}, ...)\``
        syncIODev(route, expression)
        return underlyingHeaders.append.apply(
          underlyingHeaders,
          arguments as any
        )
      },
    },
    delete: {
      value: function _delete() {
        const expression = `\`headers().delete(${describeNameArg(arguments[0])})\``
        syncIODev(route, expression)
        return underlyingHeaders.delete.apply(
          underlyingHeaders,
          arguments as any
        )
      },
    },
    get: {
      value: function get() {
        const expression = `\`headers().get(${describeNameArg(arguments[0])})\``
        syncIODev(route, expression)
        return underlyingHeaders.get.apply(underlyingHeaders, arguments as any)
      },
    },
    has: {
      value: function has() {
        const expression = `\`headers().has(${describeNameArg(arguments[0])})\``
        syncIODev(route, expression)
        return underlyingHeaders.has.apply(underlyingHeaders, arguments as any)
      },
    },
    set: {
      value: function set() {
        const expression = `\`headers().set(${describeNameArg(arguments[0])}, ...)\``
        syncIODev(route, expression)
        return underlyingHeaders.set.apply(underlyingHeaders, arguments as any)
      },
    },
    getSetCookie: {
      value: function getSetCookie() {
        const expression = '`headers().getSetCookie()`'
        syncIODev(route, expression)
        return underlyingHeaders.getSetCookie.apply(
          underlyingHeaders,
          arguments as any
        )
      },
    },
    forEach: {
      value: function forEach() {
        const expression = '`headers().forEach(...)`'
        syncIODev(route, expression)
        return underlyingHeaders.forEach.apply(
          underlyingHeaders,
          arguments as any
        )
      },
    },
    keys: {
      value: function keys() {
        const expression = '`headers().keys()`'
        syncIODev(route, expression)
        return underlyingHeaders.keys.apply(underlyingHeaders, arguments as any)
      },
    },
    values: {
      value: function values() {
        const expression = '`headers().values()`'
        syncIODev(route, expression)
        return underlyingHeaders.values.apply(
          underlyingHeaders,
          arguments as any
        )
      },
    },
    entries: {
      value: function entries() {
        const expression = '`headers().entries()`'
        syncIODev(route, expression)
        return underlyingHeaders.entries.apply(
          underlyingHeaders,
          arguments as any
        )
      },
    },
    [Symbol.iterator]: {
      value: function () {
        const expression = '`...headers()` or similar iteration'
        syncIODev(route, expression)
        return underlyingHeaders[Symbol.iterator].apply(
          underlyingHeaders,
          arguments as any
        )
      },
    },
  } satisfies HeadersExtensions)

  return promise
}

function describeNameArg(arg: unknown) {
  return typeof arg === 'string' ? `'${arg}'` : '...'
}

function syncIODev(route: string | undefined, expression: string) {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (
    workUnitStore &&
    workUnitStore.type === 'request' &&
    workUnitStore.prerenderPhase === true
  ) {
    // When we're rendering dynamically in dev we need to advance out of the
    // Prerender environment when we read Request data synchronously
    const requestStore = workUnitStore
    trackSynchronousRequestDataAccessInDev(requestStore)
  }
  // In all cases we warn normally
  warnForSyncAccess(route, expression)
}

const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createHeadersAccessError
)

function createHeadersAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`headers()\` should be awaited before using its value. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

type HeadersExtensions = {
  [K in keyof ReadonlyHeaders]: unknown
}
