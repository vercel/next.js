import {
  type ReadonlyRequestCookies,
  type ResponseCookies,
  areCookiesMutableInCurrentPhase,
  RequestCookiesAdapter,
} from '../web/spec-extension/adapters/request-cookies'
import { RequestCookies } from '../web/spec-extension/cookies'
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
  delayUntilRuntimeStage,
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
 * In this version of Next.js `cookies()` returns a Promise however you can still reference the properties of the underlying cookies object
 * synchronously to facilitate migration. The `UnsafeUnwrappedCookies` type is added to your code by a codemod that attempts to automatically
 * updates callsites to reflect the new Promise return type. There are some cases where `cookies()` cannot be automatically converted, namely
 * when it is used inside a synchronous function and we can't be sure the function can be made async automatically. In these cases we add an
 * explicit type case to `UnsafeUnwrappedCookies` to enable typescript to allow for the synchronous usage only where it is actually necessary.
 *
 * You should should update these callsites to either be async functions where the `cookies()` value can be awaited or you should call `cookies()`
 * from outside and await the return value before passing it into this function.
 *
 * You can find instances that require manual migration by searching for `UnsafeUnwrappedCookies` in your codebase or by search for a comment that
 * starts with `@next-codemod-error`.
 *
 * In a future version of Next.js `cookies()` will only return a Promise and you will not be able to access the underlying cookies object directly
 * without awaiting the return value first. When this change happens the type `UnsafeUnwrappedCookies` will be updated to reflect that is it no longer
 * usable.
 *
 * This type is marked deprecated to help identify it as target for refactoring away.
 *
 * @deprecated
 */
export type UnsafeUnwrappedCookies = ReadonlyRequestCookies

export function cookies(): Promise<ReadonlyRequestCookies> {
  const callingExpression = 'cookies'
  const workStore = workAsyncStorage.getStore()
  const workUnitStore = workUnitAsyncStorage.getStore()

  if (workStore) {
    if (
      workUnitStore &&
      workUnitStore.phase === 'after' &&
      !isRequestAPICallableInsideAfter()
    ) {
      throw new Error(
        // TODO(after): clarify that this only applies to pages?
        `Route ${workStore.route} used "cookies" inside "after(...)". This is not supported. If you need this data inside an "after" callback, use "cookies" outside of the callback. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/after`
      )
    }

    if (workStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // cookies object without tracking
      const underlyingCookies = createEmptyCookies()
      return makeUntrackedExoticCookies(underlyingCookies)
    }

    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'cache':
          const error = new Error(
            `Route ${workStore.route} used "cookies" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "cookies" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, cookies)
          workStore.invalidDynamicUsageError ??= error
          throw error
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used "cookies" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "cookies" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )
        case 'prerender':
          return makeHangingCookies(workStore, workUnitStore)
        case 'prerender-client':
          const exportName = '`cookies`'
          throw new InvariantError(
            `${exportName} must not be used within a client component. Next.js should be preventing ${exportName} from being included in client components statically, but did not in this case.`
          )
        case 'prerender-ppr':
          // We need track dynamic access here eagerly to keep continuity with
          // how cookies has worked in PPR without cacheComponents.
          return postponeWithTracking(
            workStore.route,
            callingExpression,
            workUnitStore.dynamicTracking
          )
        case 'prerender-legacy':
          // We track dynamic access here so we don't need to wrap the cookies
          // in individual property access tracking.
          return throwToInterruptStaticGeneration(
            callingExpression,
            workStore,
            workUnitStore
          )
        case 'prerender-runtime':
          return delayUntilRuntimeStage(
            workUnitStore,
            makeUntrackedCookies(workUnitStore.cookies)
          )
        case 'private-cache':
          if (process.env.__NEXT_CACHE_COMPONENTS) {
            return makeUntrackedCookies(workUnitStore.cookies)
          }

          return makeUntrackedExoticCookies(workUnitStore.cookies)
        case 'request':
          trackDynamicDataInDynamicRender(workUnitStore)

          let underlyingCookies: ReadonlyRequestCookies

          if (areCookiesMutableInCurrentPhase(workUnitStore)) {
            // We can't conditionally return different types here based on the context.
            // To avoid confusion, we always return the readonly type here.
            underlyingCookies =
              workUnitStore.userspaceMutableCookies as unknown as ReadonlyRequestCookies
          } else {
            underlyingCookies = workUnitStore.cookies
          }

          if (process.env.NODE_ENV === 'development') {
            // Semantically we only need the dev tracking when running in `next dev`
            // but since you would never use next dev with production NODE_ENV we use this
            // as a proxy so we can statically exclude this code from production builds.
            if (process.env.__NEXT_CACHE_COMPONENTS) {
              return makeUntrackedCookiesWithDevWarnings(
                underlyingCookies,
                workStore?.route
              )
            }

            return makeUntrackedExoticCookiesWithDevWarnings(
              underlyingCookies,
              workStore?.route
            )
          } else {
            if (process.env.__NEXT_CACHE_COMPONENTS) {
              return makeUntrackedCookies(underlyingCookies)
            }

            return makeUntrackedExoticCookies(underlyingCookies)
          }
        default:
          workUnitStore satisfies never
      }
    }
  }

  // If we end up here, there was no work store or work unit store present.
  throwForMissingRequestStore(callingExpression)
}

function createEmptyCookies(): ReadonlyRequestCookies {
  return RequestCookiesAdapter.seal(new RequestCookies(new Headers({})))
}

interface CacheLifetime {}
const CachedCookies = new WeakMap<
  CacheLifetime,
  Promise<ReadonlyRequestCookies>
>()

function makeHangingCookies(
  workStore: WorkStore,
  prerenderStore: PrerenderStoreModern
): Promise<ReadonlyRequestCookies> {
  const cachedPromise = CachedCookies.get(prerenderStore)
  if (cachedPromise) {
    return cachedPromise
  }

  const promise = makeHangingPromise<ReadonlyRequestCookies>(
    prerenderStore.renderSignal,
    workStore.route,
    '`cookies()`'
  )
  CachedCookies.set(prerenderStore, promise)

  return promise
}

function makeUntrackedCookies(
  underlyingCookies: ReadonlyRequestCookies
): Promise<ReadonlyRequestCookies> {
  const cachedCookies = CachedCookies.get(underlyingCookies)
  if (cachedCookies) {
    return cachedCookies
  }

  const promise = Promise.resolve(underlyingCookies)
  CachedCookies.set(underlyingCookies, promise)

  return promise
}

function makeUntrackedExoticCookies(
  underlyingCookies: ReadonlyRequestCookies
): Promise<ReadonlyRequestCookies> {
  const cachedCookies = CachedCookies.get(underlyingCookies)
  if (cachedCookies) {
    return cachedCookies
  }

  const promise = Promise.resolve(underlyingCookies)
  CachedCookies.set(underlyingCookies, promise)

  Object.defineProperties(promise, {
    [Symbol.iterator]: {
      value: underlyingCookies[Symbol.iterator]
        ? underlyingCookies[Symbol.iterator].bind(underlyingCookies)
        : // TODO this is a polyfill for when the underlying type is ResponseCookies
          // We should remove this and unify our cookies types. We could just let this continue to throw lazily
          // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
          // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
          // has extra properties not available on RequestCookie instances.
          polyfilledResponseCookiesIterator.bind(underlyingCookies),
    },
    size: {
      get(): number {
        return underlyingCookies.size
      },
    },
    get: {
      value: underlyingCookies.get.bind(underlyingCookies),
    },
    getAll: {
      value: underlyingCookies.getAll.bind(underlyingCookies),
    },
    has: {
      value: underlyingCookies.has.bind(underlyingCookies),
    },
    set: {
      value: underlyingCookies.set.bind(underlyingCookies),
    },
    delete: {
      value: underlyingCookies.delete.bind(underlyingCookies),
    },
    clear: {
      value:
        // @ts-expect-error clear is defined in RequestCookies implementation but not in the type
        typeof underlyingCookies.clear === 'function'
          ? // @ts-expect-error clear is defined in RequestCookies implementation but not in the type
            underlyingCookies.clear.bind(underlyingCookies)
          : // TODO this is a polyfill for when the underlying type is ResponseCookies
            // We should remove this and unify our cookies types. We could just let this continue to throw lazily
            // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
            // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
            // has extra properties not available on RequestCookie instances.
            polyfilledResponseCookiesClear.bind(underlyingCookies, promise),
    },
    toString: {
      value: underlyingCookies.toString.bind(underlyingCookies),
    },
  } satisfies CookieExtensions)

  return promise
}

function makeUntrackedExoticCookiesWithDevWarnings(
  underlyingCookies: ReadonlyRequestCookies,
  route?: string
): Promise<ReadonlyRequestCookies> {
  const cachedCookies = CachedCookies.get(underlyingCookies)
  if (cachedCookies) {
    return cachedCookies
  }

  const promise = makeDevtoolsIOAwarePromise(underlyingCookies)
  CachedCookies.set(underlyingCookies, promise)

  Object.defineProperties(promise, {
    [Symbol.iterator]: {
      value: function () {
        const expression = '`...cookies()` or similar iteration'
        syncIODev(route, expression)
        return underlyingCookies[Symbol.iterator]
          ? underlyingCookies[Symbol.iterator].apply(
              underlyingCookies,
              arguments as any
            )
          : // TODO this is a polyfill for when the underlying type is ResponseCookies
            // We should remove this and unify our cookies types. We could just let this continue to throw lazily
            // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
            // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
            // has extra properties not available on RequestCookie instances.
            polyfilledResponseCookiesIterator.call(underlyingCookies)
      },
      writable: false,
    },
    size: {
      get(): number {
        const expression = '`cookies().size`'
        syncIODev(route, expression)
        return underlyingCookies.size
      },
    },
    get: {
      value: function get() {
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().get()`'
        } else {
          expression = `\`cookies().get(${describeNameArg(arguments[0])})\``
        }
        syncIODev(route, expression)
        return underlyingCookies.get.apply(underlyingCookies, arguments as any)
      },
      writable: false,
    },
    getAll: {
      value: function getAll() {
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().getAll()`'
        } else {
          expression = `\`cookies().getAll(${describeNameArg(arguments[0])})\``
        }
        syncIODev(route, expression)
        return underlyingCookies.getAll.apply(
          underlyingCookies,
          arguments as any
        )
      },
      writable: false,
    },
    has: {
      value: function get() {
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().has()`'
        } else {
          expression = `\`cookies().has(${describeNameArg(arguments[0])})\``
        }
        syncIODev(route, expression)
        return underlyingCookies.has.apply(underlyingCookies, arguments as any)
      },
      writable: false,
    },
    set: {
      value: function set() {
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().set()`'
        } else {
          const arg = arguments[0]
          if (arg) {
            expression = `\`cookies().set(${describeNameArg(arg)}, ...)\``
          } else {
            expression = '`cookies().set(...)`'
          }
        }
        syncIODev(route, expression)
        return underlyingCookies.set.apply(underlyingCookies, arguments as any)
      },
      writable: false,
    },
    delete: {
      value: function () {
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().delete()`'
        } else if (arguments.length === 1) {
          expression = `\`cookies().delete(${describeNameArg(arguments[0])})\``
        } else {
          expression = `\`cookies().delete(${describeNameArg(arguments[0])}, ...)\``
        }
        syncIODev(route, expression)
        return underlyingCookies.delete.apply(
          underlyingCookies,
          arguments as any
        )
      },
      writable: false,
    },
    clear: {
      value: function clear() {
        const expression = '`cookies().clear()`'
        syncIODev(route, expression)
        // @ts-ignore clear is defined in RequestCookies implementation but not in the type
        return typeof underlyingCookies.clear === 'function'
          ? // @ts-ignore clear is defined in RequestCookies implementation but not in the type
            underlyingCookies.clear.apply(underlyingCookies, arguments)
          : // TODO this is a polyfill for when the underlying type is ResponseCookies
            // We should remove this and unify our cookies types. We could just let this continue to throw lazily
            // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
            // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
            // has extra properties not available on RequestCookie instances.
            polyfilledResponseCookiesClear.call(underlyingCookies, promise)
      },
      writable: false,
    },
    toString: {
      value: function toString() {
        const expression = '`cookies().toString()` or implicit casting'
        syncIODev(route, expression)
        return underlyingCookies.toString.apply(
          underlyingCookies,
          arguments as any
        )
      },
      writable: false,
    },
  } satisfies CookieExtensions)

  return promise
}

// Similar to `makeUntrackedExoticCookiesWithDevWarnings`, but just logging the
// sync access without actually defining the cookies properties on the promise.
function makeUntrackedCookiesWithDevWarnings(
  underlyingCookies: ReadonlyRequestCookies,
  route?: string
): Promise<ReadonlyRequestCookies> {
  const cachedCookies = CachedCookies.get(underlyingCookies)
  if (cachedCookies) {
    return cachedCookies
  }

  const promise = makeDevtoolsIOAwarePromise(underlyingCookies)

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      switch (prop) {
        case Symbol.iterator: {
          warnForSyncAccess(route, '`...cookies()` or similar iteration')
          break
        }
        case 'size':
        case 'get':
        case 'getAll':
        case 'has':
        case 'set':
        case 'delete':
        case 'clear':
        case 'toString': {
          warnForSyncAccess(route, `\`cookies().${prop}\``)
          break
        }
        default: {
          // We only warn for well-defined properties of the cookies object.
        }
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
  })

  CachedCookies.set(underlyingCookies, proxiedPromise)

  return proxiedPromise
}

function describeNameArg(arg: unknown) {
  return typeof arg === 'object' &&
    arg !== null &&
    typeof (arg as any).name === 'string'
    ? `'${(arg as any).name}'`
    : typeof arg === 'string'
      ? `'${arg}'`
      : '...'
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
  createCookiesAccessError
)

function createCookiesAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`cookies()\` should be awaited before using its value. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function polyfilledResponseCookiesIterator(
  this: ResponseCookies
): ReturnType<ReadonlyRequestCookies[typeof Symbol.iterator]> {
  return this.getAll()
    .map((c) => [c.name, c] as [string, any])
    .values()
}

function polyfilledResponseCookiesClear(
  this: ResponseCookies,
  returnable: Promise<ReadonlyRequestCookies>
): typeof returnable {
  for (const cookie of this.getAll()) {
    this.delete(cookie.name)
  }
  return returnable
}

type CookieExtensions = {
  [K in keyof ReadonlyRequestCookies | 'clear']: unknown
}
