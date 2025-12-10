import {
  type ReadonlyRequestCookies,
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
  type RequestStore,
} from '../app-render/work-unit-async-storage.external'
import {
  delayUntilRuntimeStage,
  postponeWithTracking,
  throwToInterruptStaticGeneration,
  trackDynamicDataInDynamicRender,
} from '../app-render/dynamic-rendering'
import { StaticGenBailoutError } from '../../client/components/static-generation-bailout'
import {
  makeDevtoolsIOAwarePromise,
  makeHangingPromise,
} from '../dynamic-rendering-utils'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { isRequestAPICallableInsideAfter } from './utils'
import { InvariantError } from '../../shared/lib/invariant-error'
import { RenderStage } from '../app-render/staged-rendering'

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
        `Route ${workStore.route} used \`cookies()\` inside \`after()\`. This is not supported. If you need this data inside an \`after()\` callback, use \`cookies()\` outside of the callback. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/after`
      )
    }

    if (workStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // cookies object without tracking
      const underlyingCookies = createEmptyCookies()
      return makeUntrackedCookies(underlyingCookies)
    }

    if (workStore.dynamicShouldError) {
      throw new StaticGenBailoutError(
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'cache':
          const error = new Error(
            `Route ${workStore.route} used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, cookies)
          workStore.invalidDynamicUsageError ??= error
          throw error
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used \`cookies()\` inside a function cached with \`unstable_cache()\`. Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )
        case 'prerender':
          return makeHangingCookies(workStore, workUnitStore)
        case 'prerender-client':
          const exportName = '`cookies`'
          throw new InvariantError(
            `${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`
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
          // Private caches are delayed until the runtime stage in use-cache-wrapper,
          // so we don't need an additional delay here.
          return makeUntrackedCookies(workUnitStore.cookies)
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
            return makeUntrackedCookiesWithDevWarnings(
              workUnitStore,
              underlyingCookies,
              workStore?.route
            )
          } else {
            return makeUntrackedCookies(underlyingCookies)
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

function makeUntrackedCookiesWithDevWarnings(
  requestStore: RequestStore,
  underlyingCookies: ReadonlyRequestCookies,
  route?: string
): Promise<ReadonlyRequestCookies> {
  if (requestStore.asyncApiPromises) {
    let promise: Promise<ReadonlyRequestCookies>
    if (underlyingCookies === requestStore.mutableCookies) {
      promise = requestStore.asyncApiPromises.mutableCookies
    } else if (underlyingCookies === requestStore.cookies) {
      promise = requestStore.asyncApiPromises.cookies
    } else {
      throw new InvariantError(
        'Received an underlying cookies object that does not match either `cookies` or `mutableCookies`'
      )
    }
    return instrumentCookiesPromiseWithDevWarnings(promise, route)
  }

  const cachedCookies = CachedCookies.get(underlyingCookies)
  if (cachedCookies) {
    return cachedCookies
  }

  const promise = makeDevtoolsIOAwarePromise(
    underlyingCookies,
    requestStore,
    RenderStage.Runtime
  )

  const proxiedPromise = instrumentCookiesPromiseWithDevWarnings(promise, route)

  CachedCookies.set(underlyingCookies, proxiedPromise)

  return proxiedPromise
}

const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createCookiesAccessError
)

function instrumentCookiesPromiseWithDevWarnings(
  promise: Promise<ReadonlyRequestCookies>,
  route: string | undefined
) {
  Object.defineProperties(promise, {
    [Symbol.iterator]: replaceableWarningDescriptorForSymbolIterator(
      promise,
      route
    ),
    size: replaceableWarningDescriptor(promise, 'size', route),
    get: replaceableWarningDescriptor(promise, 'get', route),
    getAll: replaceableWarningDescriptor(promise, 'getAll', route),
    has: replaceableWarningDescriptor(promise, 'has', route),
    set: replaceableWarningDescriptor(promise, 'set', route),
    delete: replaceableWarningDescriptor(promise, 'delete', route),
    clear: replaceableWarningDescriptor(promise, 'clear', route),
    toString: replaceableWarningDescriptor(promise, 'toString', route),
  })
  return promise
}

function replaceableWarningDescriptor(
  target: unknown,
  prop: string,
  route: string | undefined
) {
  return {
    enumerable: false,
    get() {
      warnForSyncAccess(route, `\`cookies().${prop}\``)
      return undefined
    },
    set(value: unknown) {
      Object.defineProperty(target, prop, {
        value,
        writable: true,
        configurable: true,
      })
    },
    configurable: true,
  }
}

function replaceableWarningDescriptorForSymbolIterator(
  target: unknown,
  route: string | undefined
) {
  return {
    enumerable: false,
    get() {
      warnForSyncAccess(route, '`...cookies()` or similar iteration')
      return undefined
    },
    set(value: unknown) {
      Object.defineProperty(target, Symbol.iterator, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    },
    configurable: true,
  }
}

function createCookiesAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}
