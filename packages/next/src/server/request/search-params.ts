import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import type { VaryParamsAccumulator } from '../app-render/vary-params'
import {
  createVaryingSearchParams,
  getMetadataVaryParamsAccumulator,
} from '../app-render/vary-params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  throwToInterruptStaticGeneration,
  annotateDynamicAccess,
} from '../app-render/dynamic-rendering'
import { dynamicAccessAsyncStorage } from '../app-render/dynamic-access-async-storage.external'

import {
  workUnitAsyncStorage,
  type PrerenderStoreLegacy,
  type PrerenderStoreModern,
  type PrerenderStoreModernRuntime,
  type StaticPrerenderStore,
  throwInvariantForMissingStore,
  type RequestStore,
  type ValidationStoreClient,
} from '../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  makeDevtoolsIOAwarePromise,
  makeRuntimeHangingPromise,
  makePromiseFromTrigger,
  trackRuntimeDataAccessed,
  RENDER_STAGES_BY_DATA_KIND,
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
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
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
      case 'generate-static-params':
        throw new InvariantError(
          'createSearchParamsFromClient should not be called inside generateStaticParams.'
        )
      case 'validation-client': {
        if (workUnitStore.validationSamples) {
          return createClientSearchParamsInValidation(
            underlyingSearchParams,
            workStore,
            workUnitStore
          )
        }
        return makeUntrackedSearchParams(underlyingSearchParams)
      }
      case 'request':
        return createRenderSearchParams(
          underlyingSearchParams,
          workStore,
          workUnitStore
        )
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export function createServerSearchParamsForMetadata(
  underlyingSearchParams: SearchParams
): Promise<SearchParams> {
  const metadataVaryParamsAccumulator = getMetadataVaryParamsAccumulator()
  return createServerSearchParamsForServerPage(
    underlyingSearchParams,
    metadataVaryParamsAccumulator
  )
}

export function createServerSearchParamsForServerPage(
  underlyingSearchParams: SearchParams,
  varyParamsAccumulator: VaryParamsAccumulator | null
): Promise<SearchParams> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-legacy':
        return createStaticPrerenderSearchParams(workStore, workUnitStore)
      case 'validation-client':
        throw new InvariantError(
          'createServerSearchParamsForServerPage should not be called in a client validation.'
        )
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createServerSearchParamsForServerPage should not be called in cache contexts.'
        )
      case 'generate-static-params':
        throw new InvariantError(
          'createServerSearchParamsForServerPage should not be called inside generateStaticParams.'
        )
      case 'prerender-runtime':
        return createRuntimePrerenderSearchParams(
          underlyingSearchParams,
          workStore,
          workUnitStore,
          varyParamsAccumulator
        )
      case 'request':
        return createRenderSearchParams(
          underlyingSearchParams,
          workStore,
          workUnitStore
        )
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

export function createPrerenderSearchParamsForClientPage(): Promise<SearchParams> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
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
        return makeRuntimeHangingPromise(
          workUnitStore.renderSignal,
          workStore.route,
          '`searchParams`',
          workUnitStore
        )
      case 'validation-client':
        throw new InvariantError(
          'createPrerenderSearchParamsForClientPage should not be called in a client validation.'
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
      case 'generate-static-params':
        throw new InvariantError(
          'createPrerenderSearchParamsForClientPage should not be called inside generateStaticParams.'
        )
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
  workStore: WorkStore,
  workUnitStore: PrerenderStoreModernRuntime,
  varyParamsAccumulator: VaryParamsAccumulator | null
): Promise<SearchParams> {
  const userspaceSearchParams =
    varyParamsAccumulator !== null
      ? createVaryingSearchParams(varyParamsAccumulator, underlyingSearchParams)
      : underlyingSearchParams

  const result = makeUntrackedSearchParams(userspaceSearchParams)

  const searchParamsStage = RENDER_STAGES_BY_DATA_KIND.runtimeLinkData

  const { stagedRendering } = workUnitStore
  if (!stagedRendering) {
    // If there's no stage controller, we're in a prospective runtime prerender.
    // Make sure we don't unblock content that won't be reached in the final prerender.
    if (workUnitStore.finalStage < searchParamsStage) {
      return makeHangingSearchParams(workStore, workUnitStore)
    } else {
      return result
    }
  }

  // Unlike `createRuntimePrerenderParams`, which uses `delayUntilStage`, we
  // resolve with `waitForStage(...).then(...)` here. Switching search params to
  // `delayUntilStage` drops the source code frame from the instant-validation
  // "URL data outside of Suspense" error when a page awaits `searchParams` at
  // the top level (params, read via a nested component, is unaffected). See the
  // `missing suspense around search params` cases in the instant-validation
  // `suspense-boundaries` tests. The underlying reason in React's async I/O
  // await tracking isn't understood yet. TODO: align search params with params
  // on `delayUntilStage` once resolved.
  return stagedRendering.waitForStage(searchParamsStage).then(() => result)
}

function createRenderSearchParams(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore,
  requestStore: RequestStore
): Promise<SearchParams> {
  const { asyncApiPromises, validationSamples } = requestStore

  if (asyncApiPromises) {
    let userspaceSearchParams = underlyingSearchParams
    if (validationSamples) {
      userspaceSearchParams = createSearchParamsProxyForInstantValidation(
        workStore,
        validationSamples,
        underlyingSearchParams
      )
    }

    return createStagedRenderSearchParams(
      workStore,
      asyncApiPromises,
      underlyingSearchParams,
      userspaceSearchParams
    )
  }

  // No staged rendering = no cacheComponents, or cacheComponents prod without cachedNavigations

  if (workStore.forceStatic) {
    // When using forceStatic we override all other logic and always just return an empty
    // dictionary object.
    return Promise.resolve({})
  }

  if (process.env.NODE_ENV === 'development') {
    // Semantically we only need the dev tracking when running in `next dev`
    // but since you would never use next dev with production NODE_ENV we use this
    // as a proxy so we can statically exclude this code from production builds.
    return makeUntrackedSearchParamsWithDevWarnings(
      underlyingSearchParams,
      workStore,
      requestStore
    )
  } else {
    return makeUntrackedSearchParams(underlyingSearchParams)
  }
}

function createStagedRenderSearchParams(
  workStore: WorkStore,
  asyncApiPromises: NonNullable<RequestStore['asyncApiPromises']>,
  underlyingSearchParams: SearchParams,
  userspaceSearchParams: SearchParams
): Promise<SearchParams> {
  const trigger = asyncApiPromises.sharedSearchParamsParent

  if (process.env.NODE_ENV === 'development') {
    // We wrap each instance of searchParams in a `new Promise()`.
    // This is important when all awaits are in third party which would otherwise
    // track all the way to the internal params.
    const promise = new Promise<SearchParams>((resolve, reject) => {
      trigger.then(() => resolve(userspaceSearchParams), reject)
    })
    // @ts-expect-error
    promise.displayName = 'searchParams'
    promise.catch(ignoreReject)

    return instrumentSearchParamsPromiseWithDevWarnings(
      underlyingSearchParams,
      promise,
      workStore
    )
  } else {
    return makePromiseFromTrigger(trigger, userspaceSearchParams)
  }
}

function createSearchParamsProxyForInstantValidation(
  workStore: WorkStore,
  validationSamples: NonNullable<RequestStore['validationSamples']>,
  underlyingSearchParams: SearchParams
) {
  const { createExhaustiveSearchParamsProxy } =
    require('../app-render/instant-validation/instant-samples') as typeof import('../app-render/instant-validation/instant-samples')
  const declaredKeys = new Set(
    Object.keys(validationSamples.searchParams ?? {})
  )
  return createExhaustiveSearchParamsProxy(
    underlyingSearchParams,
    declaredKeys,
    workStore.route
  )
}

interface CacheLifetime {}
const CachedSearchParams = new WeakMap<CacheLifetime, Promise<SearchParams>>()

const CachedSearchParamsForUseCache = new WeakMap<
  CacheLifetime,
  Promise<SearchParams>
>()

function makeHangingSearchParams(
  workStore: WorkStore,
  prerenderStore: PrerenderStoreModern | PrerenderStoreModernRuntime
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(prerenderStore)
  if (cachedSearchParams) {
    return cachedSearchParams
  }

  const promise = makeRuntimeHangingPromise<SearchParams>(
    prerenderStore.renderSignal,
    workStore.route,
    '`searchParams`',
    // Passing `null` for the store disables tracking of params usage.
    // We want accesses of chained promises to be tracked as well.
    // TODO: The custom tracking seems unnecessary, we should standardize it
    null
  )

  const trackSearchParamsAccessed = () => {
    // Record against the store that's active at access time: the promise is
    // created while the RSC payload is constructed, but typically accessed
    // later, during the render, under a different store.
    const workUnitStore = workUnitAsyncStorage.getStore()
    trackRuntimeDataAccessed(workUnitStore ?? prerenderStore, '`searchParams`')
  }

  const proxyHandler: ProxyHandler<Promise<SearchParams>> = {
    get(target, prop, receiver) {
      if (Object.hasOwn(target, prop)) {
        // The promise has this property directly. we must return it.
        // We know it isn't a dynamic access because it can only be something
        // that was previously written to the promise and thus not an underlying searchParam value
        return ReflectAdapter.get(target, prop, receiver)
      }

      switch (prop) {
        case 'then':
        case 'catch':
        case 'finally': {
          const originalMethod = ReflectAdapter.get(target, prop, receiver)
          return {
            [prop]: (...args: unknown[]) => {
              const expression =
                '`await searchParams`, `searchParams.then`, or similar'
              trackSearchParamsAccessed()
              annotateDynamicAccess(expression, prerenderStore)
              // Mirror `makeHangingParams`: when this never-resolving promise
              // is awaited while a `use cache` key is being encoded
              // (dynamicAccessAsyncStorage is set), abort so the surrounding
              // cache bails out to a dynamic hole instead of hanging on it.
              // Without this, a private cache that reads `searchParams` would
              // stall the App Shell cache-warming render. Re-wrapping the
              // result propagates the same behavior to promises derived via
              // `.then`/`.catch`/`.finally` that are then passed into a cache.
              const dynamicAccessStore = dynamicAccessAsyncStorage.getStore()
              if (dynamicAccessStore) {
                dynamicAccessStore.abortController.abort(
                  new Error('Accessed `searchParams` during prerendering.')
                )
              }
              return new Proxy(originalMethod.apply(target, args), proxyHandler)
            },
          }[prop]
        }
        case 'status': {
          const expression =
            '`use(searchParams)`, `searchParams.status`, or similar'
          trackSearchParamsAccessed()
          annotateDynamicAccess(expression, prerenderStore)
          return ReflectAdapter.get(target, prop, receiver)
        }

        default: {
          return ReflectAdapter.get(target, prop, receiver)
        }
      }
    },
  }

  const proxiedPromise = new Proxy(promise, proxyHandler)

  CachedSearchParams.set(prerenderStore, proxiedPromise)
  return proxiedPromise
}

function makeErroringSearchParams(
  workStore: WorkStore,
  prerenderStore: PrerenderStoreLegacy
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
export function makeErroringSearchParamsForUseCache(): Promise<SearchParams> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
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
  workStore: WorkStore,
  requestStore: RequestStore
): Promise<SearchParams> {
  const cachedSearchParams = CachedSearchParams.get(underlyingSearchParams)
  if (cachedSearchParams) {
    return cachedSearchParams
  }
  const promise = makeUntrackedSearchParamsWithDevWarningsImpl(
    underlyingSearchParams,
    workStore,
    requestStore
  )
  CachedSearchParams.set(requestStore, promise)
  return promise
}

function makeUntrackedSearchParamsWithDevWarningsImpl(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore,
  requestStore: RequestStore
): Promise<SearchParams> {
  const promiseInitialized = { current: false }
  const proxiedUnderlying = instrumentSearchParamsObjectWithDevWarnings(
    underlyingSearchParams,
    workStore,
    promiseInitialized
  )

  const promise = makeDevtoolsIOAwarePromise(
    proxiedUnderlying,
    requestStore,
    RENDER_STAGES_BY_DATA_KIND.runtimeLinkData
  )

  promise.then(
    () => {
      promiseInitialized.current = true
    },
    // If we're in staged rendering, this promise will reject if the render
    // is aborted before it can reach the runtime stage.
    // In that case, we have to prevent an unhandled rejection from the promise
    // created by this `.then()` call.
    // This does not affect the `promiseInitialized` logic above,
    // because `proxiedUnderlying` will not be used to resolve the promise,
    // so there's no risk of any of its properties being accessed and triggering
    // an undesireable warning.
    ignoreReject
  )

  return instrumentSearchParamsPromiseWithDevWarnings(
    underlyingSearchParams,
    promise,
    workStore
  )
}

function ignoreReject() {}

function instrumentSearchParamsObjectWithDevWarnings(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore,
  promiseInitialized: { current: boolean }
) {
  // We have an unfortunate sequence of events that requires this initialization logic. We want to instrument the underlying
  // searchParams object to detect if you are accessing values in dev. This is used for warnings and for things like the static prerender
  // indicator. However when we pass this proxy to our Promise.resolve() below the VM checks if the resolved value is a promise by looking
  // at the `.then` property. To our dynamic tracking logic this is indistinguishable from a `then` searchParam and so we would normally trigger
  // dynamic tracking. However we know that this .then is not real dynamic access, it's just how thenables resolve in sequence. So we introduce
  // this initialization concept so we omit the dynamic check until after we've constructed our resolved promise.
  return new Proxy(underlyingSearchParams, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && promiseInitialized.current) {
        if (workStore.dynamicShouldError) {
          const expression = describeStringPropertyAccess('searchParams', prop)
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            workStore.route,
            expression
          )
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        if (workStore.dynamicShouldError) {
          const expression = describeHasCheckingStringProperty(
            'searchParams',
            prop
          )
          throwWithStaticGenerationBailoutErrorWithDynamicError(
            workStore.route,
            expression
          )
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      if (workStore.dynamicShouldError) {
        const expression =
          '`{...searchParams}`, `Object.keys(searchParams)`, or similar'
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          workStore.route,
          expression
        )
      }
      return Reflect.ownKeys(target)
    },
  })
}

function instrumentSearchParamsPromiseWithDevWarnings(
  underlyingSearchParams: SearchParams,
  promise: Promise<SearchParams>,
  workStore: WorkStore
) {
  // Track which properties we should warn for.
  const proxiedProperties = new Set<string>()

  Object.keys(underlyingSearchParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      proxiedProperties.add(prop)
    }
  })

  return new Proxy(promise, {
    get(target, prop, receiver) {
      if (prop === 'then' && workStore.dynamicShouldError) {
        const expression = '`searchParams.then`'
        throwWithStaticGenerationBailoutErrorWithDynamicError(
          workStore.route,
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
          warnForSyncAccess(workStore.route, expression)
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
          warnForSyncAccess(workStore.route, expression)
        }
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      const expression = '`Object.keys(searchParams)` or similar'
      warnForSyncAccess(workStore.route, expression)
      return Reflect.ownKeys(target)
    },
  })
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

function createClientSearchParamsInValidation(
  underlyingSearchParams: SearchParams,
  workStore: WorkStore,
  workUnitStore: ValidationStoreClient
) {
  const { createExhaustiveSearchParamsProxy } =
    require('../app-render/instant-validation/instant-samples') as typeof import('../app-render/instant-validation/instant-samples')
  const declaredKeys = new Set(
    Object.keys(workUnitStore.validationSamples?.searchParams ?? {})
  )
  underlyingSearchParams = createExhaustiveSearchParamsProxy(
    underlyingSearchParams,
    declaredKeys,
    workStore.route
  )
  return Promise.resolve(underlyingSearchParams)
}
