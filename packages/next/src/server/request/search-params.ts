import type { WorkStore } from '../app-render/work-async-storage.external'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  throwToInterruptStaticGeneration,
  postponeWithTracking,
  annotateDynamicAccess,
  delayUntilRuntimeStage,
} from '../app-render/dynamic-rendering'

import {
  workUnitAsyncStorage,
  type PrerenderStoreLegacy,
  type PrerenderStorePPR,
  type PrerenderStoreModern,
  type PrerenderStoreModernRuntime,
  type StaticPrerenderStore,
  throwInvariantForMissingStore,
} from '../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  makeDevtoolsIOAwarePromise,
  makeHangingPromise,
} from '../dynamic-rendering-utils'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import {
  describeStringPropertyAccess,
  describeHasCheckingStringProperty,
  wellKnownProperties,
} from '../../shared/lib/utils/reflect-utils'
import {
  throwWithStaticGenerationBailoutErrorWithDynamicError,
  throwForSearchParamsAccessInUseCache,
} from './utils'

export type SearchParams = { [key: string]: string | string[] | undefined }

export function createSearchParamsFromClient(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore
): Promise<SearchParams> {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
        return createStaticPrerenderSearchParams(workStore, workUnitStore)
      case 'prerender-runtime':
        throw new InvariantError(
          'createSearchParamsFromClient should not be called in a runtime prerender.'
        )
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createSearchParamsFromClient should not be called in cache contexts.'
        )
      case 'request':
        return createRenderSearchParams(underlyingSearchParams, workStore)
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export const createServerSearchParamsForMetadata =
  createServerSearchParamsForServerPage

export function createServerSearchParamsForServerPage(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore
): Promise<SearchParams> {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
        return createStaticPrerenderSearchParams(workStore, workUnitStore)
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createServerSearchParamsForServerPage should not be called in cache contexts.'
        )
      case 'prerender-runtime':
        return createRuntimePrerenderSearchParams(
          underlyingSearchParams,
          workUnitStore
        )
      case 'request':
        return createRenderSearchParams(underlyingSearchParams, workStore)
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

export function createPrerenderSearchParamsForClientPage(
  workStore: WorkStore
): Promise<SearchParams> {
  if (workStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
        // We're prerendering in a mode that aborts (cacheComponents) and should stall
        // the promise to ensure the RSC side is considered dynamic
        return makeHangingPromise(
          workUnitStore.renderSignal,
          workStore.route,
          '`searchParams`'
        )
      case 'prerender-runtime':
        throw new InvariantError(
          'createPrerenderSearchParamsForClientPage should not be called in a runtime prerender.'
        )
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createPrerenderSearchParamsForClientPage should not be called in cache contexts.'
        )
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
        return Promise.resolve({})
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

function createStaticPrerenderSearchParams(
  workStore: WorkStore,
  prerenderStore: StaticPrerenderStore
): Promise<SearchParams> {
  if (workStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  }

  switch (prerenderStore.type) {
    case 'prerender':
    case 'prerender-client':
      // We are in a cacheComponents (PPR or otherwise) prerender
      return makeHangingSearchParams(workStore, prerenderStore)
    case 'prerender-ppr':
    case 'prerender-legacy':
      // We are in a legacy static generation and need to interrupt the
      // prerender when search params are accessed.
      return makeErroringSearchParams(workStore, prerenderStore)
    default:
      return prerenderStore satisfies never
  }
}

function createRuntimePrerenderSearchParams(
  underlyingSearchParams: SearchParams,
  workUnitStore: PrerenderStoreModernRuntime
): Promise<SearchParams> {
  return delayUntilRuntimeStage(
    workUnitStore,
    makeUntrackedSearchParams(underlyingSearchParams)
  )
}

function createRenderSearchParams(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore
): Promise<SearchParams> {
  if (workStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  } else {
    if (process.env.NODE_ENV === 'development') {
      // Semantically we only need the dev tracking when running in `next dev`
      // but since you would never use next dev with production NODE_ENV we use this
      // as a proxy so we can statically exclude this code from production builds.
      return makeUntrackedSearchParamsWithDevWarnings(
        underlyingSearchParams,
        workStore
      )
    } else {
      return makeUntrackedSearchParams(underlyingSearchParams)
    }
  }
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

const CachedSearchParamsForUseCache = new WeakMap<
  CacheLifetime,
  Promise<SearchParams>
>()

function makeHangingSearchParams(
  workStore: WorkStore,
  prerenderStore: PrerenderStoreModern
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(prerenderStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = makeHangingPromise<SearchParams>(
    prerenderStore.renderSignal,
    workStore.route,
    '`searchParams`'
  )

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (Object.hasOwn(promise, prop)) {
        // The promise has this property directly. we must return it.
        // We know it isn't a dynamic access because it can only be something
        // that was previously written to the promise and thus not an underlying searchParam value
        return ReflectAdapter.get(target, prop, receiver)
      }

      switch (prop) {
        case 'then': {
          const expression =
            '`await searchParams`, `searchParams.then`, or similar'
          annotateDynamicAccess(expression, prerenderStore)
          return ReflectAdapter.get(target, prop, receiver)
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
          annotateDynamicAccess(expression, prerenderStore)
          return ReflectAdapter.get(target, prop, receiver)
        }

        default: {
          return ReflectAdapter.get(target, prop, receiver)
        }
      }
    },
  })

  CachedSearchParams.set(prerenderStore, proxiedPromise)
  return proxiedPromise
}

function makeErroringSearchParams(
  workStore: WorkStore,
  prerenderStore: PrerenderStoreLegacy | PrerenderStorePPR
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(workStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const underlyingSearchParams = {}
  // For search params we don't construct a ReactPromise because we want to interrupt
  // rendering on any property access that was not set from outside and so we only want
  // to have properties like value and status if React sets them.
  const promise = Promise.resolve(underlyingSearchParams)

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (Object.hasOwn(promise, prop)) {
        // The promise has this property directly. we must return it.
        // We know it isn't a dynamic access because it can only be something
        // that was previously written to the promise and thus not an underlying searchParam value
        return ReflectAdapter.get(target, prop, receiver)
      }

      if (typeof prop === 'string' && prop === 'then') {
        const expression =
          '`await searchParams`, `searchParams.then`, or similar'
        if (workStore.dynamicShouldError) {
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            workStore.route,
            expression
          )
        } else if (prerenderStore.type === 'prerender-ppr') {
          // PPR Prerender (no cacheComponents)
          postponeWithTracking(
            workStore.route,
            expression,
            prerenderStore.dynamicTracking
          )
        } else {
          // Legacy Prerender
          throwToInterruptStaticGeneration(
            expression,
            workStore,
            prerenderStore
          )
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
  })

  CachedSearchParams.set(workStore, proxiedPromise)
  return proxiedPromise
}

/**
 * This is a variation of `makeErroringSearchParams` that always throws an
 * error on access, because accessing searchParams inside of `"use cache"` is
 * not allowed.
 */
export function makeErroringSearchParamsForUseCache(
  workStore: WorkStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParamsForUseCache.get(workStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = Promise.resolve({})

  const proxiedPromise = new Proxy(promise, {
    get: function get(target, prop, receiver) {
      if (Object.hasOwn(promise, prop)) {
        // The promise has this property directly. we must return it. We know it
        // isn't a dynamic access because it can only be something that was
        // previously written to the promise and thus not an underlying
        // searchParam value
        return ReflectAdapter.get(target, prop, receiver)
      }

      if (
        typeof prop === 'string' &&
        (prop === 'then' || !wellKnownProperties.has(prop))
      ) {
        throwForSearchParamsAccessInUseCache(workStore, get)
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
  })

  CachedSearchParamsForUseCache.set(workStore, proxiedPromise)
  return proxiedPromise
}

function makeUntrackedSearchParams(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = Promise.resolve(underlyingSearchParams)
  CachedSearchParams.set(underlyingSearchParams, promise)

  return promise
}

function makeUntrackedSearchParamsWithDevWarnings(
  underlyingSearchParams: SearchParams,
  store: WorkStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  // Track which properties we should warn for.
  const proxiedProperties = new Set<string>()

  // We have an unfortunate sequence of events that requires this initialization logic. We want to instrument the underlying
  // searchParams object to detect if you are accessing values in dev. This is used for warnings and for things like the static prerender
  // indicator. However when we pass this proxy to our Promise.resolve() below the VM checks if the resolved value is a promise by looking
  // at the `.then` property. To our dynamic tracking logic this is indistinguishable from a `then` searchParam and so we would normally trigger
  // dynamic tracking. However we know that this .then is not real dynamic access, it's just how thenables resolve in sequence. So we introduce
  // this initialization concept so we omit the dynamic check until after we've constructed our resolved promise.
  let promiseInitialized = false
  const proxiedUnderlying = new Proxy(underlyingSearchParams, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && promiseInitialized) {
        if (store.dynamicShouldError) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            store.route,
            expression
          )
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (store.dynamicShouldError) {
          const expression = describeHasCheckingStringProperty(
            'searchParams',
            prop
          )
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            store.route,
            expression
          )
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      if (store.dynamicShouldError) {
        const expression =
          '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          store.route,
          expression
        )
      }
      return Reflect.ownKeys(target)
    },
  })

  // We don't use makeResolvedReactPromise here because searchParams
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = makeDevtoolsIOAwarePromise(proxiedUnderlying)
  promise.then(() => {
    promiseInitialized = true
  })

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      proxiedProperties.add(prop)
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
      if (prop === 'then' && store.dynamicShouldError) {
        const expression = '`searchParams.then`'
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          store.route,
          expression
        )
      }
      if (typeof prop === 'string') {
        if (
          !wellKnownProperties.has(prop) &&
          (proxiedProperties.has(prop) ||
            // We are accessing a property that doesn't exist on the promise nor
            // the underlying searchParams.
            Reflect.has(target, prop) === false)
        ) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          warnForSyncAccess(store.route, expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string') {
        proxiedProperties.delete(prop)
      }
      return Reflect.set(target, prop, value, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (
          !wellKnownProperties.has(prop) &&
          (proxiedProperties.has(prop) ||
            // We are accessing a property that doesn't exist on the promise nor
            // the underlying searchParams.
            Reflect.has(target, prop) === false)
        ) {
          const expression = describeHasCheckingStringProperty(
            'searchParams',
            prop
          )
          warnForSyncAccess(store.route, expression)
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      const expression = '`Object.keys(searchParams)` or similar'
      warnForSyncAccess(store.route, expression)
      return Reflect.ownKeys(target)
    },
  })

  CachedSearchParams.set(underlyingSearchParams, proxiedPromise)
  return proxiedPromise
}

const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createSearchAccessError
)

function createSearchAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`searchParams\` is a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}
