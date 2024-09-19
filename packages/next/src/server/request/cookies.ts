import {
  type ReadonlyRequestCookies,
  type ResponseCookies,
  RequestCookiesAdapter,
} from '../../server/web/spec-extension/adapters/request-cookies'
import { RequestCookies } from '../../server/web/spec-extension/cookies'
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
} from '../../server/app-render/dynamic-rendering'
import { getExpectedRequestStore } from '../../client/components/request-async-storage.external'
import { actionAsyncStorage } from '../../client/components/action-async-storage.external'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'

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
 * starts with:
 *
 * ```
 * // TODO [sync-cookies-usage]
 * ```
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
  const requestStore = getExpectedRequestStore(callingExpression)
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()
  const prerenderStore = prerenderAsyncStorage.getStore()

  if (staticGenerationStore) {
    if (staticGenerationStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // cookies object without tracking
      const underlyingCookies = createEmptyCookies()
      return makeUntrackedExoticCookies(underlyingCookies)
    }

    if (staticGenerationStore.isUnstableCacheCallback) {
      throw new Error(
        `Route ${staticGenerationStore.route} used "cookies" inside a function cached with "unstable_cache(...)". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use "cookies" outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
      )
    } else if (staticGenerationStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${staticGenerationStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (prerenderStore) {
      // We are in PPR and/or dynamicIO mode and prerendering

      if (prerenderStore.controller || prerenderStore.cacheSignal) {
        // We use the controller and cacheSignal as an indication we are in dynamicIO mode.
        // When resolving cookies for a prerender with dynamic IO we return a forever promise
        // along with property access tracked synchronous cookies.

        // We don't track dynamic access here because access will be tracked when you access
        // one of the properties of the cookies object.
        return makeDynamicallyTrackedExoticCookies(
          staticGenerationStore.route,
          prerenderStore
        )
      } else {
        // We are prerendering with PPR. We need track dynamic access here eagerly
        // to keep continuity with how cookies has worked in PPR without dynamicIO.
        // TODO consider switching the semantic to throw on property access instead
        postponeWithTracking(
          staticGenerationStore.route,
          'cookies',
          prerenderStore.dynamicTracking
        )
      }
    } else if (staticGenerationStore.isStaticGeneration) {
      // We are in a legacy static generation mode while prerendering
      // We track dynamic access here so we don't need to wrap the cookies in
      // individual property access tracking.
      interruptStaticGeneration('cookies', staticGenerationStore)
    }
    // We fall through to the dynamic context below but we still track dynamic access
    // because in dev we can still error for things like using cookies inside a cache context
    trackDynamicDataInDynamicRender(staticGenerationStore)
  }

  // cookies is being called in a dynamic context
  const actionStore = actionAsyncStorage.getStore()

  let underlyingCookies: ReadonlyRequestCookies

  // The current implementation of cookies will return Response cookies
  // for a server action during the render phase of a server action.
  // This is not correct b/c the type of cookies during render is ReadOnlyRequestCookies
  // where as the type of cookies during action is ResponseCookies
  // This was found because RequestCookies is iterable and ResponseCookies is not
  if (actionStore?.isAction || actionStore?.isAppRoute) {
    // We can't conditionally return different types here based on the context.
    // To avoid confusion, we always return the readonly type here.
    underlyingCookies =
      requestStore.mutableCookies as unknown as ReadonlyRequestCookies
  } else {
    underlyingCookies = requestStore.cookies
  }

  if (process.env.NODE_ENV === 'development') {
    return makeUntrackedExoticCookiesWithDevWarnings(
      underlyingCookies,
      staticGenerationStore?.route
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

function hangForever() {}
function makeDynamicallyTrackedExoticCookies(
  route: string,
  prerenderStore: PrerenderStore
): Promise<ReadonlyRequestCookies> {
  const cachedPromise = CachedCookies.get(prerenderStore)
  if (cachedPromise) {
    return cachedPromise
  }

  const underlying = createEmptyCookies()
  const promise = new Promise<ReadonlyRequestCookies>(hangForever)
  CachedCookies.set(prerenderStore, promise)

  const controller = prerenderStore.controller
  const dynamicTracking = prerenderStore.dynamicTracking

  Object.defineProperties(promise, {
    [Symbol.iterator]: {
      value: function () {
        const expression = 'cookies()[Symbol.iterator]()'
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying[Symbol.iterator]()
      },
    },
    size: {
      get() {
        const expression = `cookies().size`
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.size
      },
    },
    get: {
      value: function get() {
        let expression: string
        if (arguments.length === 0) {
          expression = 'cookies().get()'
        } else {
          expression = `cookies().get(${describeNameArg(arguments[0])})`
        }
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.get.apply(underlying, arguments as any)
      },
    },
    getAll: {
      value: function getAll() {
        let expression: string
        if (arguments.length === 0) {
          expression = `cookies().getAll()`
        } else {
          expression = `cookies().getAll(${describeNameArg(arguments[0])})`
        }
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.getAll.apply(underlying, arguments as any)
      },
    },
    has: {
      value: function has() {
        let expression: string
        if (arguments.length === 0) {
          expression = `cookies().has()`
        } else {
          expression = `cookies().has(${describeNameArg(arguments[0])})`
        }
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
        let expression: string
        if (arguments.length === 0) {
          expression = 'cookies().set()'
        } else {
          const arg = arguments[0]
          if (arg) {
            expression = `cookies().set(${describeNameArg(arg)}, ...)`
          } else {
            expression = `cookies().set(...)`
          }
        }
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.set.apply(underlying, arguments as any)
      },
    },
    delete: {
      value: function () {
        let expression: string
        if (arguments.length === 0) {
          expression = `cookies().delete()`
        } else if (arguments.length === 1) {
          expression = `cookies().delete(${describeNameArg(arguments[0])})`
        } else {
          expression = `cookies().delete(${describeNameArg(arguments[0])}, ...)`
        }
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.delete.apply(underlying, arguments as any)
      },
    },
    clear: {
      value: function clear() {
        const expression = 'cookies().clear()'
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        // @ts-ignore clear is denied in RequestCookies implementation but not in the type
        underlying.clear.apply(underlying, arguments)
      },
    },
    toString: {
      value: function toString() {
        const expression = 'cookies().toString()'
        abortOnSynchronousDynamicDataAccess(
          route,
          expression,
          controller,
          dynamicTracking
        )
        return underlying.toString.apply(underlying, arguments as any)
      },
    },
  })

  return promise
}

function makeUntrackedExoticCookies(
  underlying: ReadonlyRequestCookies
): Promise<ReadonlyRequestCookies> {
  const cachedCookies = CachedCookies.get(underlying)
  if (cachedCookies) {
    return cachedCookies
  }

  const promise = Promise.resolve(underlying)
  CachedCookies.set(underlying, promise)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
    },
    value: {
      value: underlying,
    },
    [Symbol.iterator]: {
      value: underlying[Symbol.iterator]
        ? underlying[Symbol.iterator].bind(underlying)
        : // TODO this is a polyfill for when the underlying type is ResponseCookies
          // We should remove this and unify our cookies types. We could just let this continue to throw lazily
          // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
          // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
          // has extra properties not available on RequestCookie instances.
          polyfilledResponseCookiesIterator.bind(underlying),
    },
    size: {
      get(): number {
        return underlying.size
      },
    },
    get: {
      value: underlying.get.bind(underlying),
    },
    getAll: {
      value: underlying.getAll.bind(underlying),
    },
    has: {
      value: underlying.has.bind(underlying),
    },
    set: {
      value: underlying.set.bind(underlying),
    },
    delete: {
      value: underlying.delete.bind(underlying),
    },
    clear: {
      value:
        // @ts-ignore clear is denied in RequestCookies implementation but not in the type
        typeof underlying.clear === 'function'
          ? // @ts-ignore clear is denied in RequestCookies implementation but not in the type
            underlying.clear.bind(underlying)
          : // TODO this is a polyfill for when the underlying type is ResponseCookies
            // We should remove this and unify our cookies types. We could just let this continue to throw lazily
            // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
            // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
            // has extra properties not available on RequestCookie instances.
            polyfilledResponseCookiesClear.bind(underlying, promise),
    },
    toString: {
      value: underlying.toString.bind(underlying),
    },
  })

  return promise
}

function makeUntrackedExoticCookiesWithDevWarnings(
  underlying: ReadonlyRequestCookies,
  route?: string
): Promise<ReadonlyRequestCookies> {
  const cachedCookies = CachedCookies.get(underlying)
  if (cachedCookies) {
    return cachedCookies
  }

  const promise = Promise.resolve(underlying)
  CachedCookies.set(underlying, promise)

  Object.defineProperties(promise, {
    status: {
      value: 'fulfilled',
      writable: true,
    },
    value: {
      value: underlying,
      writable: true,
    },
    [Symbol.iterator]: {
      value: function () {
        warnForSyncIteration(route)
        return underlying[Symbol.iterator]
          ? underlying[Symbol.iterator].apply(underlying, arguments as any)
          : // TODO this is a polyfill for when the underlying type is ResponseCookies
            // We should remove this and unify our cookies types. We could just let this continue to throw lazily
            // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
            // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
            // has extra properties not available on RequestCookie instances.
            polyfilledResponseCookiesIterator.call(underlying)
      },
      writable: false,
    },
    size: {
      get(): number {
        const expression = 'cookies().size'
        warnForSyncAccess(route, expression)
        return underlying.size
      },
    },
    get: {
      value: function get() {
        let expression: string
        if (arguments.length === 0) {
          expression = 'cookies().get()'
        } else {
          expression = `cookies().get(${describeNameArg(arguments[0])})`
        }
        warnForSyncAccess(route, expression)
        return underlying.get.apply(underlying, arguments as any)
      },
      writable: false,
    },
    getAll: {
      value: function getAll() {
        let expression: string
        if (arguments.length === 0) {
          expression = `cookies().getAll()`
        } else {
          expression = `cookies().getAll(${describeNameArg(arguments[0])})`
        }
        warnForSyncAccess(route, expression)
        return underlying.getAll.apply(underlying, arguments as any)
      },
      writable: false,
    },
    has: {
      value: function get() {
        let expression: string
        if (arguments.length === 0) {
          expression = `cookies().has()`
        } else {
          expression = `cookies().has(${describeNameArg(arguments[0])})`
        }
        warnForSyncAccess(route, expression)
        return underlying.has.apply(underlying, arguments as any)
      },
      writable: false,
    },
    set: {
      value: function set() {
        let expression: string
        if (arguments.length === 0) {
          expression = 'cookies().set()'
        } else {
          const arg = arguments[0]
          if (arg) {
            expression = `cookies().set(${describeNameArg(arg)}, ...)`
          } else {
            expression = `cookies().set(...)`
          }
        }
        warnForSyncAccess(route, expression)
        return underlying.set.apply(underlying, arguments as any)
      },
      writable: false,
    },
    delete: {
      value: function () {
        let expression: string
        if (arguments.length === 0) {
          expression = `cookies().delete()`
        } else if (arguments.length === 1) {
          expression = `cookies().delete(${describeNameArg(arguments[0])})`
        } else {
          expression = `cookies().delete(${describeNameArg(arguments[0])}, ...)`
        }
        warnForSyncAccess(route, expression)
        return underlying.delete.apply(underlying, arguments as any)
      },
      writable: false,
    },
    clear: {
      value: function clear() {
        const expression = 'cookies().clear()'
        warnForSyncAccess(route, expression)
        // @ts-ignore clear is denied in RequestCookies implementation but not in the type
        return typeof underlying.clear === 'function'
          ? // @ts-ignore clear is denied in RequestCookies implementation but not in the type
            underlying.clear.apply(underlying, arguments)
          : // TODO this is a polyfill for when the underlying type is ResponseCookies
            // We should remove this and unify our cookies types. We could just let this continue to throw lazily
            // but that's already a hard thing to debug so we may as well implement it consistently. The biggest problem with
            // implementing this in this way is the underlying cookie type is a ResponseCookie and not a RequestCookie and so it
            // has extra properties not available on RequestCookie instances.
            polyfilledResponseCookiesClear.call(underlying, promise)
      },
      writable: false,
    },
    toString: {
      value: function toString() {
        const expression = 'cookies().toString()'
        warnForSyncAccess(route, expression)
        return underlying.toString.apply(underlying, arguments as any)
      },
      writable: false,
    },
  })

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

function warnForSyncIteration(route?: string) {
  const prefix = route ? ` In route ${route} ` : ''
  console.error(
    `${prefix}cookies were iterated implicitly with something like \`for...of cookies())\` or \`[...cookies()]\`, or explicitly with \`cookies()[Symbol.iterator]()\`. \`cookies()\` now returns a Promise and the return value should be awaited before attempting to iterate over cookies. In this version of Next.js iterating cookies without awaiting first is still supported to facilitate migration but in a future version you will be required to await the result. If this \`cookies()\` use is inside an async function await the return value before accessing attempting iteration. If this use is inside a synchronous function then convert the function to async or await the call from outside this function and pass the result in.`
  )
}

function warnForSyncAccess(route: undefined | string, expression: string) {
  const prefix = route ? ` In route ${route} a ` : 'A '
  console.error(
    `${prefix}cookie property was accessed directly with \`${expression}\`. \`cookies()\` now returns a Promise and the return value should be awaited before accessing properties of the underlying cookies instance. In this version of Next.js direct access to \`${expression}\` is still supported to facilitate migration but in a future version you will be required to await the result. If this \`cookies()\` use is inside an async function await the return value before accessing attempting iteration. If this use is inside a synchronous function then convert the function to async or await the call from outside this function and pass the result in.`
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
