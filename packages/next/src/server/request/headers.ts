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
import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'

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
        `Route ${workStore.route} used \`headers()\` inside \`after()\`. This is not supported. If you need this data inside an \`after()\` callback, use \`headers()\` outside of the callback. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/after`
      )
    }

    if (workStore.forceStatic) {
      // When using forceStatic we override all other logic and always just return an empty
      // headers object without tracking
      const underlyingHeaders = HeadersAdapter.seal(new Headers({}))
      return makeUntrackedHeaders(underlyingHeaders)
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'cache': {
          const error = new Error(
            `Route ${workStore.route} used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`
          )
          Error.captureStackTrace(error, headers)
          workStore.invalidDynamicUsageError ??= error
          throw error
        }
        case 'unstable-cache':
          throw new Error(
            `Route ${workStore.route} used \`headers()\` inside a function cached with \`unstable_cache()\`. Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`
          )
        case 'prerender':
        case 'prerender-client':
        case 'private-cache':
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
        `Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`
      )
    }

    if (workUnitStore) {
      switch (workUnitStore.type) {
        case 'prerender':
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
        case 'prerender-runtime':
          return delayUntilRuntimeStage(
            workUnitStore,
            makeUntrackedHeaders(workUnitStore.headers)
          )
        case 'private-cache':
          // Private caches are delayed until the runtime stage in use-cache-wrapper,
          // so we don't need an additional delay here.
          return makeUntrackedHeaders(workUnitStore.headers)
        case 'request':
          trackDynamicDataInDynamicRender(workUnitStore)

          if (process.env.NODE_ENV === 'development') {
            // Semantically we only need the dev tracking when running in `next dev`
            // but since you would never use next dev with production NODE_ENV we use this
            // as a proxy so we can statically exclude this code from production builds.
            return makeUntrackedHeadersWithDevWarnings(
              workUnitStore.headers,
              workStore?.route
            )
          } else {
            return makeUntrackedHeaders(workUnitStore.headers)
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
  // If CC is enabled, don't cache the promise.
  if (process.env.__NEXT_CACHE_COMPONENTS) {
    return Promise.resolve(underlyingHeaders)
  }

  const cachedHeaders = CachedHeaders.get(underlyingHeaders)
  if (cachedHeaders) {
    return cachedHeaders
  }

  const promise = Promise.resolve(underlyingHeaders)
  CachedHeaders.set(underlyingHeaders, promise)

  return promise
}

function makeUntrackedHeadersWithDevWarnings(
  underlyingHeaders: ReadonlyHeaders,
  route?: string
): Promise<ReadonlyHeaders> {
  // If CC is enabled, don't cache the promise.
  if (process.env.__NEXT_CACHE_COMPONENTS) {
    return makeUntrackedHeadersWithDevWarningsImpl(underlyingHeaders, route)
  } else {
    let cachedHeaders = CachedHeaders.get(underlyingHeaders)
    if (!cachedHeaders) {
      cachedHeaders = makeUntrackedHeadersWithDevWarningsImpl(
        underlyingHeaders,
        route
      )
      CachedHeaders.set(underlyingHeaders, cachedHeaders)
    }
    return cachedHeaders
  }
}

function makeUntrackedHeadersWithDevWarningsImpl(
  underlyingHeaders: ReadonlyHeaders,
  route?: string
): Promise<ReadonlyHeaders> {
  const promise = makeDevtoolsIOAwarePromise(underlyingHeaders)

  return new Proxy(promise, {
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
      `\`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}
