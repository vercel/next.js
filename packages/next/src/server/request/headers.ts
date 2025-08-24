import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../web/spec-extension/adapters/headers'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import {
  throwForMissingRequestStore,
  workUnitAsyncStorage,
  type PrerenderStoreModern,
} from '../app-render/work-unit-async-storage.external'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
  trackDynamicDataInDynamicRender,
  trackSynchronousRequestDataAccessInDev,
} from '../app-render/dynamic-rendering'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import {
  makeDevtoolsIOAwarePromise,
  makeHangingPromise,
} from '../dynamic-rendering-utils'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { isRequestAPICallableInsideAfter } from './utils'
import { InvariantError } from '../../shared/lib/invariant-error'
import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'

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
  const callingExpression = 'headers'
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
      switch (workUnitStore.type) {
        case 'cache': {
          const error = new Error(
            `Route ${workStore.route} used "headers" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "headers" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, headers)
          workStore.invalidDynamicUsageError ??= error
          throw error
        }
        case 'private-cache': {
          const error = new Error(
            `Route ${workStore.route} used "headers" inside "use cache: private". Accessing "headers" inside a private cache scope is not supported. If you need this data inside a cached function use "headers" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, headers)
          workStore.invalidDynamicUsageError ??= error
          throw error
        }
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used "headers" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "headers" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )
        case 'prerender':
        case 'prerender-client':
        case 'prerender-runtime':
        case 'prerender-ppr':
        case 'prerender-legacy':
        case 'request':
          break
        default:
          workUnitStore satisfies never
      }
    }

    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'prerender':
        case 'prerender-runtime':
          return makeHangingHeaders(workStore, workUnitStore)
        case 'prerender-client':
          const exportName = '`headers`'
          throw new InvariantError(
            `${exportName} must not be used within a client component. Next.js should be preventing ${exportName} from being included in client components statically, but did not in this case.`
          )
        case 'prerender-ppr':
          // PPR Prerender (no cacheComponents)
          // We are prerendering with PPR. We need track dynamic access here eagerly
          // to keep continuity with how headers has worked in PPR without cacheComponents.
          // TODO consider switching the semantic to throw on property access instead
          return postponeWithTracking(
            workStore.route,
            callingExpression,
            workUnitStore.dynamicTracking
          )
        case 'prerender-legacy':
          // Legacy Prerender
          // We are in a legacy static generation mode while prerendering
          // We track dynamic access here so we don't need to wrap the headers in
          // individual property access tracking.
          return throwToInterruptStaticGeneration(
            callingExpression,
            workStore,
            workUnitStore
          )
        case 'request':
          trackDynamicDataInDynamicRender(workUnitStore)

          if (process.env.NODE_ENV === 'development') {
            // Semantically we only need the dev tracking when running in `next dev`
            // but since you would never use next dev with production NODE_ENV we use this
            // as a proxy so we can statically exclude this code from production builds.
            if (process.env.__NEXT_CACHE_COMPONENTS) {
              return makeUntrackedHeadersWithDevWarnings(
                workUnitStore.headers,
                workStore?.route
              )
            }

            return makeUntrackedExoticHeadersWithDevWarnings(
              workUnitStore.headers,
              workStore?.route
            )
          } else {
            if (process.env.__NEXT_CACHE_COMPONENTS) {
              return makeUntrackedHeaders(workUnitStore.headers)
            }

            return makeUntrackedExoticHeaders(workUnitStore.headers)
          }
          break
        default:
          workUnitStore satisfies never
      }
    }
  }

  // If we end up here, there was no work store or work unit store present.
  throwForMissingRequestStore(callingExpression)
}

interface CacheLifetime {}
const CachedHeaders = new WeakMap<CacheLifetime, Promise<ReadonlyHeaders>>()

function makeHangingHeaders(
  workStore: WorkStore,
  prerenderStore: PrerenderStoreModern
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(prerenderStore)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = makeHangingPromise<ReadonlyHeaders>(
    prerenderStore.renderSignal,
    workStore.route,
    '`headers()`'
  )
  CachedHeaders.set(prerenderStore, promise)

  return promise
}

function makeUntrackedHeaders(
  underlyingHeaders: ReadonlyHeaders
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(underlyingHeaders)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = Promise.resolve(underlyingHeaders)
  CachedHeaders.set(underlyingHeaders, promise)

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

  const promise = makeDevtoolsIOAwarePromise(underlyingHeaders)

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

// Similar to `makeUntrackedExoticHeadersWithDevWarnings`, but just logging the
// sync access without actually defining the headers properties on the promise.
function makeUntrackedHeadersWithDevWarnings(
  underlyingHeaders: ReadonlyHeaders,
  route?: string
): Promise<ReadonlyHeaders> {
  const cachedHeaders = CachedHeaders.get(underlyingHeaders)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = makeDevtoolsIOAwarePromise(underlyingHeaders)

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      switch (prop) {
        case Symbol.iterator: {
          warnForSyncAccess(route, '`...headers()` or similar iteration')
          break
        }
        case 'append':
        case 'delete':
        case 'get':
        case 'has':
        case 'set':
        case 'getSetCookie':
        case 'forEach':
        case 'keys':
        case 'values':
        case 'entries': {
          warnForSyncAccess(route, `\`headers().${prop}\``)
          break
        }
        default: {
          // We only warn for well-defined properties of the headers object.
        }
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
  })

  CachedHeaders.set(underlyingHeaders, proxiedPromise)

  return proxiedPromise
}

function describeNameArg(arg: unknown) {
  return typeof arg === 'string' ? `'${arg}'` : '...'
}

function syncIODev(route: string | undefined, expression: string) {
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'request':
        if (workUnitStore.prerenderPhase === true) {
          // When we're rendering dynamically in dev, we need to advance out of
          // the Prerender environment when we read Request data synchronously.
          trackSynchronousRequestDataAccessInDev(workUnitStore)
        }
        break
      case 'prerender':
      case 'prerender-client':
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
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
