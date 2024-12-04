import {
  type ReadonlyRequestCookies,
  type ResponseCookies,
  areCookiesMutableInCurrentPhase,
  RequestCookiesAdapter,
} from '../web/spec-extension/adapters/request-cookies'
import { RequestCookies } from '../web/spec-extension/cookies'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
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
import { getExpectedRequestStore } from '../app-render/work-unit-async-storage.external'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { scheduleImmediate } from '../../lib/scheduler'
import { isRequestAPICallableInsideAfter } from './utils'

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
        `Route ${workStore.route} used "cookies" inside "unstable_after(...)". This is not supported. If you need this data inside an "unstable_after" callback, use "cookies" outside of the callback. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/unstable_after`
      )
    }

    if (workStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // cookies object without tracking
      const underlyingCookies = createEmptyCookies()
      return makeUntrackedExoticCookies(underlyingCookies)
    }

    if (workUnitStore) {
      if (workUnitStore.type === 'cache') {
        throw new Error(
          `Route ${workStore.route} used "cookies" inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "cookies" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
        )
      } else if (workUnitStore.type === 'unstable-cache') {
        throw new Error(
          `Route ${workStore.route} used "cookies" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "cookies" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
        )
      }
    }
    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      if (workUnitStore.type === 'prerender') {
        // dynamicIO Prerender
        // We don't track dynamic access here because access will be tracked when you access
        // one of the properties of the cookies object.
        return makeDynamicallyTrackedExoticCookies(
          workStore.route,
          workUnitStore
        )
      } else if (workUnitStore.type === 'prerender-ppr') {
        // PPR Prerender (no dynamicIO)
        // We are prerendering with PPR. We need track dynamic access here eagerly
        // to keep continuity with how cookies has worked in PPR without dynamicIO.
        postponeWithTracking(
          workStore.route,
          callingExpression,
          workUnitStore.dynamicTracking
        )
      } else if (workUnitStore.type === 'prerender-legacy') {
        // Legacy Prerender
        // We track dynamic access here so we don't need to wrap the cookies in
        // individual property access tracking.
        throwToInterruptStaticGeneration(
          callingExpression,
          workStore,
          workUnitStore
        )
      }
    }
    // We fall through to the dynamic context below but we still track dynamic access
    // because in dev we can still error for things like using cookies inside a cache context
    trackDynamicDataInDynamicRender(workStore, workUnitStore)
  }

  // cookies is being called in a dynamic context

  const requestStore = getExpectedRequestStore(callingExpression)

  let underlyingCookies: ReadonlyRequestCookies

  if (areCookiesMutableInCurrentPhase(requestStore)) {
    // We can't conditionally return different types here based on the context.
    // To avoid confusion, we always return the readonly type here.
    underlyingCookies =
      requestStore.userspaceMutableCookies as unknown as ReadonlyRequestCookies
  } else {
    underlyingCookies = requestStore.cookies
  }

  if (process.env.NODE_ENV === 'development' && !workStore?.isPrefetchRequest) {
    return makeUntrackedExoticCookiesWithDevWarnings(
      underlyingCookies,
      workStore?.route
    )
  } else {
    return makeUntrackedExoticCookies(underlyingCookies)
  }
}

function createEmptyCookies(): ReadonlyRequestCookies {
  return RequestCookiesAdapter.seal(new RequestCookies(new Headers({})))
}

interface CacheLifetime {}
const CachedCookies = new WeakMap<
  CacheLifetime,
  Promise<ReadonlyRequestCookies>
>()

function makeDynamicallyTrackedExoticCookies(
  route: string,
  prerenderStore: PrerenderStoreModern
): Promise<ReadonlyRequestCookies> {
  const cachedPromise = CachedCookies.get(prerenderStore)
  if (cachedPromise) {
    return cachedPromise
  }

  const promise = makeHangingPromise<ReadonlyRequestCookies>(
    prerenderStore.renderSignal,
    '`cookies()`'
  )
  CachedCookies.set(prerenderStore, promise)

  Object.defineProperties(promise, {
    [Symbol.iterator]: {
      value: function () {
        const expression = '`cookies()[Symbol.iterator]()`'
        const error = createCookiesAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    size: {
      get() {
        const expression = '`cookies().size`'
        const error = createCookiesAccessError(route, expression)
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
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().get()`'
        } else {
          expression = `\`cookies().get(${describeNameArg(arguments[0])})\``
        }
        const error = createCookiesAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    getAll: {
      value: function getAll() {
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().getAll()`'
        } else {
          expression = `\`cookies().getAll(${describeNameArg(arguments[0])})\``
        }
        const error = createCookiesAccessError(route, expression)
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
        let expression: string
        if (arguments.length === 0) {
          expression = '`cookies().has()`'
        } else {
          expression = `\`cookies().has(${describeNameArg(arguments[0])})\``
        }
        const error = createCookiesAccessError(route, expression)
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
        const error = createCookiesAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
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
        const error = createCookiesAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    clear: {
      value: function clear() {
        const expression = '`cookies().clear()`'
        const error = createCookiesAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
    toString: {
      value: function toString() {
        const expression = '`cookies().toString()`'
        const error = createCookiesAccessError(route, expression)
        abortAndThrowOnSynchronousRequestDataAccess(
          route,
          expression,
          error,
          prerenderStore
        )
      },
    },
  } satisfies CookieExtensions)

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

  const promise = new Promise<ReadonlyRequestCookies>((resolve) =>
    scheduleImmediate(() => resolve(underlyingCookies))
  )
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

const noop = () => {}

const warnForSyncAccess = process.env.__NEXT_DISABLE_SYNC_DYNAMIC_API_WARNINGS
  ? noop
  : createDedupedByCallsiteServerErrorLoggerDev(createCookiesAccessError)

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
