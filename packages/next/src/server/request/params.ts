import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import type { OpaqueFallbackRouteParams } from './fallback-params'
import type { VaryParamsAccumulator } from '../app-render/vary-params'
import {
  createVaryingParams,
  getMetadataVaryParamsAccumulator,
} from '../app-render/vary-params'

import { ReflectAdapter } from '../web/spec-extension/adapters/reflect'
import {
  throwToInterruptStaticGeneration,
  postponeWithTracking,
} from '../app-render/dynamic-rendering'

import {
  workUnitAsyncStorage,
  type PrerenderStorePPR,
  type PrerenderStoreLegacy,
  type StaticPrerenderStoreModern,
  type StaticPrerenderStore,
  throwInvariantForMissingStore,
  type PrerenderStoreModernRuntime,
  type RequestStore,
  type ValidationStoreClient,
} from '../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  describeStringPropertyAccess,
  wellKnownProperties,
} from '../../shared/lib/utils/reflect-utils'
import {
  makeDevtoolsIOAwarePromise,
  makeHangingPromise,
  makePromiseFromTrigger,
  RENDER_STAGES_BY_DATA_KIND,
} from '../dynamic-rendering-utils'
import { createDedupedByCallsiteServerErrorLoggerDev } from '../create-deduped-by-callsite-server-error-logger'
import { dynamicAccessAsyncStorage } from '../app-render/dynamic-access-async-storage.external'
import { RenderStage } from '../app-render/staged-rendering'

export type ParamValue = string | Array<string> | undefined
export type Params = Record<string, ParamValue>

export function createParamsFromClient(
  underlyingParams: Params
): Promise<Params> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
        // Client params don't need additional vary tracking because by the
        // time they reach the client, the access would have already been
        // tracked by the server.
        const varyParamsAccumulator = null
        return createStaticPrerenderParams(
          underlyingParams,
          null,
          workStore,
          workUnitStore,
          varyParamsAccumulator
        )
      case 'validation-client':
        return createClientParamsInInstantValidation(
          underlyingParams,
          workStore,
          workUnitStore.validationSamples
        )
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createParamsFromClient should not be called in cache contexts.'
        )
      case 'prerender-runtime':
        throw new InvariantError(
          'createParamsFromClient should not be called in a runtime prerender.'
        )
      case 'generate-static-params':
        throw new InvariantError(
          'createParamsFromClient should not be called inside generateStaticParams.'
        )
      case 'request': {
        if (workUnitStore.validationSamples) {
          return createClientParamsInInstantValidation(
            underlyingParams,
            workStore,
            workUnitStore.validationSamples
          )
        }
        if (process.env.NODE_ENV === 'development') {
          const fallbackParams = workUnitStore.fallbackParams
          const userspaceParams = underlyingParams
          return createRenderParamsInDev(
            underlyingParams,
            userspaceParams,
            fallbackParams,
            workStore,
            workUnitStore
          )
        } else {
          return createRenderParamsInProd(underlyingParams)
        }
      }
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

// generateMetadata always runs in RSC context so it is equivalent to a Server Page Component
export type CreateServerParamsForMetadata = typeof createServerParamsForMetadata
export function createServerParamsForMetadata(
  underlyingParams: Params,
  optionalCatchAllParamName: string | null,
  isRuntimePrefetchable: boolean
): Promise<Params> {
  const metadataVaryParamsAccumulator = getMetadataVaryParamsAccumulator()
  return createServerParamsForServerSegment(
    underlyingParams,
    optionalCatchAllParamName,
    metadataVaryParamsAccumulator,
    isRuntimePrefetchable
  )
}

// routes always runs in RSC context so it is equivalent to a Server Page Component
export function createServerParamsForRoute(
  underlyingParams: Params,
  varyParamsAccumulator: VaryParamsAccumulator | null = null
): Promise<Params> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-ppr':
      case 'prerender-legacy':
        return createStaticPrerenderParams(
          underlyingParams,
          null,
          workStore,
          workUnitStore,
          varyParamsAccumulator
        )
      case 'prerender-client':
      case 'validation-client':
        throw new InvariantError(
          'createServerParamsForRoute should not be called in client contexts.'
        )
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createServerParamsForRoute should not be called in cache contexts.'
        )
      case 'generate-static-params':
        throw new InvariantError(
          'createServerParamsForRoute should not be called inside generateStaticParams.'
        )
      case 'prerender-runtime': {
        // Route params are not runtime prefetchable
        const isRuntimePrefetchable = false
        return createRuntimePrerenderParams(
          underlyingParams,
          null,
          workUnitStore,
          varyParamsAccumulator,
          isRuntimePrefetchable
        )
      }
      case 'request':
        if (process.env.NODE_ENV === 'development') {
          const fallbackParams = workUnitStore.fallbackParams
          const userspaceParams = underlyingParams
          return createRenderParamsInDev(
            underlyingParams,
            userspaceParams,
            fallbackParams,
            workStore,
            workUnitStore
          )
        } else {
          return createRenderParamsInProd(underlyingParams)
        }
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

export function createServerParamsForServerSegment(
  underlyingParams: Params,
  optionalCatchAllParamName: string | null,
  varyParamsAccumulator: VaryParamsAccumulator | null,
  isRuntimePrefetchable: boolean
): Promise<Params> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Expected workStore to be initialized')
  }
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
        return createStaticPrerenderParams(
          underlyingParams,
          optionalCatchAllParamName,
          workStore,
          workUnitStore,
          varyParamsAccumulator
        )
      case 'validation-client':
        throw new InvariantError(
          'createServerParamsForServerSegment should not be called in client contexts.'
        )
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createServerParamsForServerSegment should not be called in cache contexts.'
        )
      case 'generate-static-params':
        throw new InvariantError(
          'createServerParamsForServerSegment should not be called inside generateStaticParams.'
        )
      case 'prerender-runtime':
        return createRuntimePrerenderParams(
          underlyingParams,
          optionalCatchAllParamName,
          workUnitStore,
          varyParamsAccumulator,
          isRuntimePrefetchable
        )
      case 'request': {
        return createRenderParamsForPage(
          workStore,
          workUnitStore,
          underlyingParams,
          optionalCatchAllParamName,
          varyParamsAccumulator,
          isRuntimePrefetchable
        )
      }
      default:
        workUnitStore satisfies never
    }
  }
  throwInvariantForMissingStore()
}

export function createPrerenderParamsForClientSegment(
  underlyingParams: Params
): Promise<Params> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError(
      'Missing workStore in createPrerenderParamsForClientSegment'
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
        const fallbackParams = workUnitStore.fallbackRouteParams
        if (fallbackParams) {
          for (let key in underlyingParams) {
            if (fallbackParams.has(key)) {
              // This params object has one or more fallback params, so we need
              // to consider the awaiting of this params object "dynamic". Since
              // we are in cacheComponents mode we encode this as a promise that never
              // resolves.
              return makeHangingPromise(
                workUnitStore.renderSignal,
                workStore.route,
                '`params`'
              )
            }
          }
        }
        break
      case 'validation-client':
        throw new InvariantError(
          'createPrerenderParamsForClientSegment should not be called in validation contexts.'
        )
        break
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createPrerenderParamsForClientSegment should not be called in cache contexts.'
        )
      case 'generate-static-params':
        throw new InvariantError(
          'createPrerenderParamsForClientSegment should not be called inside generateStaticParams.'
        )
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
        break
      default:
        workUnitStore satisfies never
    }
  }
  // We're prerendering in a mode that does not abort. We resolve the promise without
  // any tracking because we're just transporting a value from server to client where the tracking
  // will be applied.
  return Promise.resolve(underlyingParams)
}

function createStaticPrerenderParams(
  underlyingParams: Params,
  optionalCatchAllParamName: string | null,
  workStore: WorkStore,
  prerenderStore: StaticPrerenderStore,
  varyParamsAccumulator: VaryParamsAccumulator | null
): Promise<Params> {
  switch (prerenderStore.type) {
    case 'prerender': {
      const fallbackParams = prerenderStore.fallbackRouteParams
      if (fallbackParams) {
        for (const key in underlyingParams) {
          if (fallbackParams.has(key)) {
            // This params object has one or more fallback params, so we need
            // to consider the awaiting of this params object "dynamic". Since
            // we are in cacheComponents mode we encode this as a promise that never
            // resolves.
            return makeHangingParams(
              underlyingParams,
              workStore,
              prerenderStore
            )
          }
        }
      }

      // Even if all params are static, we need to exclude them from the shell
      // by delaying them to the static stage. This includes root params.
      const { stagedRendering } = prerenderStore
      if (
        process.env.__NEXT_APP_SHELLS &&
        stagedRendering &&
        !isEmptyParams(underlyingParams)
      ) {
        const underlyingParamsWithVarying =
          varyParamsAccumulator !== null
            ? createVaryingParams(
                varyParamsAccumulator,
                underlyingParams,
                optionalCatchAllParamName
              )
            : underlyingParams

        return stagedRendering.delayUntilStage(
          // static prerenders don't distinguish early/late, this is just for consistency.
          RENDER_STAGES_BY_DATA_KIND.staticLinkData.late,
          'params',
          underlyingParamsWithVarying
        )
      }
      break
    }
    case 'prerender-client': {
      const fallbackParams = prerenderStore.fallbackRouteParams
      if (fallbackParams) {
        for (const key in underlyingParams) {
          if (fallbackParams.has(key)) {
            // This params object has one or more fallback params, so we need
            // to consider the awaiting of this params object "dynamic". Since
            // we are in cacheComponents mode we encode this as a promise that never
            // resolves.
            return makeHangingParams(
              underlyingParams,
              workStore,
              prerenderStore
            )
          }
        }
      }
      break
    }
    case 'prerender-ppr': {
      const fallbackParams = prerenderStore.fallbackRouteParams
      if (fallbackParams) {
        for (const key in underlyingParams) {
          if (fallbackParams.has(key)) {
            return makeErroringParams(
              underlyingParams,
              fallbackParams,
              workStore,
              prerenderStore
            )
          }
        }
      }
      break
    }
    case 'prerender-legacy':
      break
    default:
      prerenderStore satisfies never
  }

  const underlyingParamsWithVarying =
    varyParamsAccumulator !== null
      ? createVaryingParams(
          varyParamsAccumulator,
          underlyingParams,
          optionalCatchAllParamName
        )
      : underlyingParams
  return makeUntrackedParams(underlyingParamsWithVarying)
}

function createRuntimePrerenderParams(
  underlyingParams: Params,
  optionalCatchAllParamName: string | null,
  workUnitStore: PrerenderStoreModernRuntime,
  varyParamsAccumulator: VaryParamsAccumulator | null,
  isRuntimePrefetchable: boolean
): Promise<Params> {
  const underlyingParamsWithVarying =
    varyParamsAccumulator !== null
      ? createVaryingParams(
          varyParamsAccumulator,
          underlyingParams,
          optionalCatchAllParamName
        )
      : underlyingParams

  const result = makeUntrackedParams(underlyingParamsWithVarying)
  const { stagedRendering } = workUnitStore
  if (!stagedRendering) {
    // If there's no staging, we're in a prospective runtime prerender,
    // and it doesn't matter when params resolve.
    return result
  }

  // if the params are empty, there's nothing to delay
  if (isEmptyParams(underlyingParams)) {
    return result
  }

  // Semantically, we should resolve static params in the static stage.
  // But params are link data, and we need to recover a param-less session shell,
  // so we delay all params until the runtime stage instead.
  const paramsStages = RENDER_STAGES_BY_DATA_KIND.runtimeLinkData
  const stage = isRuntimePrefetchable ? paramsStages.early : paramsStages.late
  return stagedRendering.waitForStage(stage).then(() => result)
}

function createRenderParamsForPage(
  workStore: WorkStore,
  workUnitStore: RequestStore,
  underlyingParams: Params,
  optionalCatchAllParamName: string | null,
  varyParamsAccumulator: VaryParamsAccumulator | null,
  isRuntimePrefetchable: boolean
) {
  const { stagedRendering, asyncApiPromises, validationSamples } = workUnitStore

  // Distinguish the params that we expose to userspace (potentially wrapped in proxies)
  // and the underlying object containing params values. We do this because wrappers
  // like `instrumentParamsPromiseWithDevWarnings` need to be able to get the known param names
  // without triggering other wrapper proxies.
  let userspaceParams = underlyingParams
  if (validationSamples) {
    userspaceParams = createServerParamsProxyForInstantValidation(
      underlyingParams,
      workStore,
      validationSamples
    )
  }
  if (varyParamsAccumulator) {
    userspaceParams = createVaryingParams(
      varyParamsAccumulator,
      userspaceParams,
      optionalCatchAllParamName
    )
  }

  if (stagedRendering && asyncApiPromises) {
    return createStagedRenderParams(
      workStore,
      workUnitStore,
      stagedRendering,
      asyncApiPromises,
      underlyingParams,
      userspaceParams,
      isRuntimePrefetchable
    )
  }

  // No staged rendering = no cacheComponents, or cacheComponents prod without cachedNavigations
  if (process.env.NODE_ENV === 'development') {
    const fallbackParams = workUnitStore.fallbackParams
    return createRenderParamsInDev(
      underlyingParams,
      userspaceParams,
      fallbackParams,
      workStore,
      workUnitStore
    )
  } else {
    return createRenderParamsInProd(userspaceParams)
  }
}

function createStagedRenderParams(
  workStore: WorkStore,
  workUnitStore: RequestStore,
  stagedRendering: NonNullable<RequestStore['stagedRendering']>,
  asyncApiPromises: NonNullable<RequestStore['asyncApiPromises']>,
  underlyingParams: Params,
  userspaceParams: Params,
  isRuntimePrefetchable: boolean
) {
  const promise = createStagedRenderParamsImpl(
    workUnitStore,
    stagedRendering,
    asyncApiPromises,
    underlyingParams,
    userspaceParams,
    isRuntimePrefetchable
  )
  if (process.env.NODE_ENV === 'development') {
    return instrumentParamsPromiseWithDevWarnings(
      underlyingParams,
      promise,
      workStore
    )
  } else {
    return promise
  }
}

function createStagedRenderParamsImpl(
  workUnitStore: RequestStore,
  stagedRendering: NonNullable<RequestStore['stagedRendering']>,
  asyncApiPromises: NonNullable<RequestStore['asyncApiPromises']>,
  /** The actual param values, without any instrumentation */
  underlyingParams: Params,
  /** The params object to return to userspace, possibly wrapped in a proxy */
  userspaceParams: Params,
  isRuntimePrefetchable: boolean
) {
  const hasFallbackParams = hasFallbackRouteParams(
    underlyingParams,
    workUnitStore.fallbackParams
  )

  // If we're rendering with shells, even static params must be delayed to exclude them from the shell.
  // For a dynamic request we generally want a static shell (session shells come from a separate render).
  if (
    process.env.__NEXT_APP_SHELLS &&
    // Params are non-empty, and there's no fallback params, so all params are static
    !isEmptyParams(underlyingParams) &&
    !hasFallbackParams
  ) {
    const staticParamsStages = RENDER_STAGES_BY_DATA_KIND.staticLinkData
    const stage = isRuntimePrefetchable
      ? staticParamsStages.early
      : staticParamsStages.late
    return stagedRendering.delayUntilStage(stage, 'params', userspaceParams)
  }

  // Otherwise, only delay if we have fallback params
  if (hasFallbackParams) {
    return createParamsPromiseFromTrigger(
      isRuntimePrefetchable
        ? asyncApiPromises.earlySharedParamsParent
        : asyncApiPromises.sharedParamsParent,
      userspaceParams
    )
  }

  return makeUntrackedParams(userspaceParams)
}

function createParamsPromiseFromTrigger(
  trigger: Promise<any>,
  userspaceParams: Params
) {
  if (process.env.NODE_ENV === 'development') {
    // We wrap each instance of params in a `new Promise()`, which lets us show each
    // await a different set of values. This is important when all awaits
    // are in third party which would otherwise track all the way to the
    // internal params.
    const promise: Promise<Params> = new Promise((resolve, reject) => {
      trigger.then(() => resolve(userspaceParams), reject)
    })
    promise.catch(noop)
    // @ts-expect-error
    promise.displayName = 'params'
    return promise
  } else {
    return makePromiseFromTrigger(trigger, userspaceParams)
  }
}

function noop() {}

function isEmptyParams(params: Params): boolean {
  for (const _paramKey in params) {
    return false
  }
  return true
}

function hasFallbackRouteParams(
  underlyingParams: Params,
  fallbackParams: OpaqueFallbackRouteParams | null | undefined
): boolean {
  if (fallbackParams) {
    for (let key in underlyingParams) {
      if (fallbackParams.has(key)) {
        return true
      }
    }
  }
  return false
}

function createServerParamsProxyForInstantValidation(
  underlyingParams: Params,
  workStore: WorkStore,
  validationSamples: NonNullable<RequestStore['validationSamples']>
): Params {
  const { createExhaustiveParamsProxy } =
    require('../app-render/instant-validation/instant-samples') as typeof import('../app-render/instant-validation/instant-samples')
  const declaredParams = new Set(Object.keys(validationSamples.params ?? {}))
  return createExhaustiveParamsProxy(
    underlyingParams,
    declaredParams,
    workStore.route
  )
}

function createClientParamsInInstantValidation(
  underlyingParams: Params,
  workStore: WorkStore,
  validationSamples: ValidationStoreClient['validationSamples']
): Promise<Params> {
  const { createExhaustiveParamsProxy } =
    require('../app-render/instant-validation/instant-samples') as typeof import('../app-render/instant-validation/instant-samples')
  const declaredParams = new Set(Object.keys(validationSamples?.params ?? {}))
  const proxiedUnderlying = createExhaustiveParamsProxy(
    underlyingParams,
    declaredParams,
    workStore.route
  )
  return Promise.resolve(proxiedUnderlying)
}

function createRenderParamsInProd(userspaceParams: Params): Promise<Params> {
  return makeUntrackedParams(userspaceParams)
}

function createRenderParamsInDev(
  underlyingParams: Params,
  userpaceParams: Params,
  fallbackParams: OpaqueFallbackRouteParams | null | undefined,
  workStore: WorkStore,
  requestStore: RequestStore
): Promise<Params> {
  return makeDynamicallyTrackedParamsWithDevWarnings(
    underlyingParams,
    userpaceParams,
    hasFallbackRouteParams(underlyingParams, fallbackParams),
    workStore,
    requestStore
  )
}

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

const fallbackParamsProxyHandler: ProxyHandler<Promise<Params>> = {
  get: function get(target, prop, receiver) {
    if (prop === 'then' || prop === 'catch' || prop === 'finally') {
      const originalMethod = ReflectAdapter.get(target, prop, receiver)

      return {
        [prop]: (...args: unknown[]) => {
          const store = dynamicAccessAsyncStorage.getStore()

          if (store) {
            store.abortController.abort(
              new Error(`Accessed fallback \`params\` during prerendering.`)
            )
          }

          return new Proxy(
            originalMethod.apply(target, args),
            fallbackParamsProxyHandler
          )
        },
      }[prop]
    }

    return ReflectAdapter.get(target, prop, receiver)
  },
}

function makeHangingParams(
  underlyingParams: Params,
  workStore: WorkStore,
  prerenderStore: StaticPrerenderStoreModern
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = new Proxy(
    makeHangingPromise<Params>(
      prerenderStore.renderSignal,
      workStore.route,
      '`params`'
    ),
    fallbackParamsProxyHandler
  )

  CachedParams.set(underlyingParams, promise)

  return promise
}

function makeErroringParams(
  underlyingParams: Params,
  fallbackParams: OpaqueFallbackRouteParams,
  workStore: WorkStore,
  prerenderStore: PrerenderStorePPR | PrerenderStoreLegacy
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const augmentedUnderlying = { ...underlyingParams }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = Promise.resolve(augmentedUnderlying)
  CachedParams.set(underlyingParams, promise)

  Object.keys(underlyingParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      if (fallbackParams.has(prop)) {
        Object.defineProperty(augmentedUnderlying, prop, {
          get() {
            const expression = describeStringPropertyAccess('params', prop)
            // In most dynamic APIs we also throw if `dynamic = "error"` however
            // for params is only dynamic when we're generating a fallback shell
            // and even when `dynamic = "error"` we still support generating dynamic
            // fallback shells
            // TODO remove this comment when cacheComponents is the default since there
            // will be no `dynamic = "error"`
            if (prerenderStore.type === 'prerender-ppr') {
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
          },
          enumerable: true,
        })
      }
    }
  })

  return promise
}

function makeUntrackedParams(underlyingParams: Params): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  const promise = Promise.resolve(underlyingParams)
  CachedParams.set(underlyingParams, promise)

  return promise
}

function makeDynamicallyTrackedParamsWithDevWarnings(
  underlyingParams: Params,
  userspaceParams: Params,
  hasFallbackParams: boolean,
  workStore: WorkStore,
  requestStore: RequestStore
): Promise<Params> {
  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = hasFallbackParams
    ? makeDevtoolsIOAwarePromise(
        userspaceParams,
        requestStore,
        RenderStage.Runtime
      )
    : // We don't want to force an environment transition when this params is not part of the fallback params set
      Promise.resolve(userspaceParams)

  const proxiedPromise = instrumentParamsPromiseWithDevWarnings(
    underlyingParams,
    promise,
    workStore
  )
  CachedParams.set(underlyingParams, proxiedPromise)
  return proxiedPromise
}

function instrumentParamsPromiseWithDevWarnings(
  underlyingParams: Params,
  promise: Promise<Params>,
  workStore: WorkStore
): Promise<Params> {
  // Track which properties we should warn for.
  const proxiedProperties = new Set<string>()

  Object.keys(underlyingParams).forEach((prop) => {
    if (wellKnownProperties.has(prop)) {
      // These properties cannot be shadowed because they need to be the
      // true underlying value for Promises to work correctly at runtime
    } else {
      proxiedProperties.add(prop)
    }
  })

  return new Proxy(promise, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (
          // We are accessing a property that was proxied to the promise instance
          proxiedProperties.has(prop)
        ) {
          const expression = describeStringPropertyAccess('params', prop)
          warnForSyncAccess(workStore.route, expression)
        }
      }
      return ReflectAdapter.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string') {
        proxiedProperties.delete(prop)
      }
      return ReflectAdapter.set(target, prop, value, receiver)
    },
    ownKeys(target) {
      const expression = '`...params` or similar expression'
      warnForSyncAccess(workStore.route, expression)
      return Reflect.ownKeys(target)
    },
  })
}

const warnForSyncAccess = createDedupedByCallsiteServerErrorLoggerDev(
  createParamsAccessError
)

function createParamsAccessError(
  route: string | undefined,
  expression: string
) {
  const prefix = route ? `Route "${route}" ` : 'This route '
  return new Error(
    `${prefix}used ${expression}. ` +
      `\`params\` is a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. ` +
      `Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`
  )
}
