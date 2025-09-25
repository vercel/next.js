import type { WorkStore } from '../app-render/work-async-storage.external'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  throwToInterruptStaticGeneration,
  postponeWithTracking,
  trackDynamicDataInDynamicRender,
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
      return makeErroringExoticSearchParams(workStore, prerenderStore)
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
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        return makeUntrackedSearchParamsWithDevWarnings(
          underlyingSearchParams,
          workStore
        )
      }

      return makeDynamicallyTrackedSearchParamsWithDevWarnings(
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

function makeErroringExoticSearchParams(
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

      switch (prop) {
        case 'then': {
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
          return
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
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
          return
        }
        default: {
          if (typeof prop === 'string' && !wellKnownProperties.has(prop)) {
            const expression = describeStringPropertyAccess(
              'searchParams',
              prop
            )
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
        }
      }
    },
    has(target, prop) {
      // We don't expect key checking to be used except for testing the existence of
      // searchParams so we make all has tests trigger dynamic. this means that `promise.then`
      // can resolve to the then function on the Promise prototype but 'then' in promise will assume
      // you are testing whether the searchParams has a 'then' property.
      if (typeof prop === 'string') {
        const expression = describeHasCheckingStringProperty(
          'searchParams',
          prop
        )
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
        return false
      }
      return ReflectAdapter.has(target, prop)
    },
    ownKeys() {
      const expression =
        '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
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
        throwToInterruptStaticGeneration(expression, workStore, prerenderStore)
      }
    },
  })

  CachedSearchParams.set(workStore, proxiedPromise)
  return proxiedPromise
}

/**
 * This is a variation of `makeErroringExoticSearchParams` that always throws an
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
    has: function has(target, prop) {
      // We don't expect key checking to be used except for testing the existence of
      // searchParams so we make all has tests throw an error. this means that `promise.then`
      // can resolve to the then function on the Promise prototype but 'then' in promise will assume
      // you are testing whether the searchParams has a 'then' property.
      if (
        typeof prop === 'string' &&
        (prop === 'then' || !wellKnownProperties.has(prop))
      ) {
        throwForSearchParamsAccessInUseCache(workStore, has)
      }

      return ReflectAdapter.has(target, prop)
    },
    ownKeys: function ownKeys() {
      throwForSearchParamsAccessInUseCache(workStore, ownKeys)
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

function makeDynamicallyTrackedSearchParamsWithDevWarnings(
  underlyingSearchParams: SearchParams,
  store: WorkStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const proxiedUnderlying = new Proxy(underlyingSearchParams, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (store.dynamicShouldError) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            store.route,
            expression
          )
        }
        const workUnitStore = workUnitAsyncStorage.getStore()
        if (workUnitStore) {
          trackDynamicDataInDynamicRender(workUnitStore)
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
        if (!wellKnownProperties.has(prop)) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          warnForSyncAccess(store.route, expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (!wellKnownProperties.has(prop)) {
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

function makeUntrackedSearchParamsWithDevWarnings(
  underlyingSearchParams: SearchParams,
  store: WorkStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const proxiedProperties = new Set<string>()
  const unproxiedProperties: Array<string> = []
  const promise = makeDevtoolsIOAwarePromise(underlyingSearchParams)

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
      unproxiedProperties.push(prop)
    } else {
      proxiedProperties.add(prop)
    }
  })

  const proxiedPromise = new Proxy(promise, {
    get(target, prop, receiver) {
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
      warnForIncompleteEnumeration(store.route, expression, unproxiedProperties)
      return Reflect.ownKeys(target)
    },
  })

  CachedSearchParams.set(underlyingSearchParams, proxiedPromise)
  return proxiedPromise
}

const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createSearchAccessError
)

const warnForIncompleteEnumeration =
  createDedupedByCallsiteServerErrorLoggerDev(createIncompleteEnumerationError)

function createSearchAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`searchParams\` should be awaited before using its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function createIncompleteEnumerationError(
  route: string | undefined,
  expression: string,
  missingProperties: Array<string>
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`searchParams\` should be awaited before using its properties. ` +
      `The following properties were not available through enumeration ` +
      `because they conflict with builtin or well-known property names: ` +
      `${describeListOfPropertyNames(missingProperties)}. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}

function describeListOfPropertyNames(properties: Array<string>) {
  switch (properties.length) {
    case 0:
      throw new InvariantError(
        'Expected describeListOfPropertyNames to be called with a non-empty list of strings.'
      )
    case 1:
      return `\`${properties[0]}\``
    case 2:
      return `\`${properties[0]}\` and \`${properties[1]}\``
    default: {
      let description = ''
      for (let i = 0; i < properties.length - 1; i++) {
        description += `\`${properties[i]}\`, `
      }
      description += `, and \`${properties[properties.length - 1]}\``
      return description
    }
  }
}
