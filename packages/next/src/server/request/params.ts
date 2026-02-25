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
} from '../app-render/work-unit-async-storage.external'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  describeStringPropertyAccess,
  wellKnownProperties,
} from '../../shared/lib/utils/reflect-utils'
import {
  makeDevtoolsIOAwarePromise,
  makeHangingPromise,
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
        // TODO(instant-validation): in build, this depends on samples
        return createRenderParamsInProd(underlyingParams)
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
      case 'request':
        if (process.env.NODE_ENV === 'development') {
          // Semantically we only need the dev tracking when running in `next dev`
          // but since you would never use next dev with production NODE_ENV we use this
          // as a proxy so we can statically exclude this code from production builds.
          const devFallbackParams = workUnitStore.devFallbackParams
          // Client params are not runtime prefetchable
          const isRuntimePrefetchable = false
          return createRenderParamsInDev(
            underlyingParams,
            devFallbackParams,
            workStore,
            workUnitStore,
            isRuntimePrefetchable
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
          // Semantically we only need the dev tracking when running in `next dev`
          // but since you would never use next dev with production NODE_ENV we use this
          // as a proxy so we can statically exclude this code from production builds.
          const devFallbackParams = workUnitStore.devFallbackParams
          // Route params are not runtime prefetchable
          const isRuntimePrefetchable = false
          return createRenderParamsInDev(
            underlyingParams,
            devFallbackParams,
            workStore,
            workUnitStore,
            isRuntimePrefetchable
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
        // TODO(instant-validation): in build, this depends on samples
        return createRenderParamsInProd(underlyingParams)
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createServerParamsForServerSegment should not be called in cache contexts.'
        )
      case 'prerender-runtime':
        return createRuntimePrerenderParams(
          underlyingParams,
          optionalCatchAllParamName,
          workUnitStore,
          varyParamsAccumulator,
          isRuntimePrefetchable
        )
      case 'request':
        if (process.env.NODE_ENV === 'development') {
          // Semantically we only need the dev tracking when running in `next dev`
          // but since you would never use next dev with production NODE_ENV we use this
          // as a proxy so we can statically exclude this code from production builds.
          const devFallbackParams = workUnitStore.devFallbackParams
          return createRenderParamsInDev(
            underlyingParams,
            devFallbackParams,
            workStore,
            workUnitStore,
            isRuntimePrefetchable
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
        // TODO(instant-validation): in build, this depends on samples
        break
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        throw new InvariantError(
          'createPrerenderParamsForClientSegment should not be called in cache contexts.'
        )
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'prerender-runtime':
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
  const underlyingParamsWithVarying =
    varyParamsAccumulator !== null
      ? createVaryingParams(
          varyParamsAccumulator,
          underlyingParams,
          optionalCatchAllParamName
        )
      : underlyingParams

  switch (prerenderStore.type) {
    case 'prerender':
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
              underlyingParamsWithVarying,
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
              underlyingParamsWithVarying,
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
    return result
  }
  const stage = isRuntimePrefetchable
    ? RenderStage.EarlyRuntime
    : RenderStage.Runtime
  return stagedRendering.waitForStage(stage).then(() => result)
}

function createRenderParamsInProd(underlyingParams: Params): Promise<Params> {
  return makeUntrackedParams(underlyingParams)
}

function createRenderParamsInDev(
  underlyingParams: Params,
  devFallbackParams: OpaqueFallbackRouteParams | null | undefined,
  workStore: WorkStore,
  requestStore: RequestStore,
  isRuntimePrefetchable: boolean
): Promise<Params> {
  let hasFallbackParams = false
  if (devFallbackParams) {
    for (let key in underlyingParams) {
      if (devFallbackParams.has(key)) {
        hasFallbackParams = true
        break
      }
    }
  }

  return makeDynamicallyTrackedParamsWithDevWarnings(
    underlyingParams,
    hasFallbackParams,
    workStore,
    requestStore,
    isRuntimePrefetchable
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
  hasFallbackParams: boolean,
  workStore: WorkStore,
  requestStore: RequestStore,
  isRuntimePrefetchable: boolean
): Promise<Params> {
  if (requestStore.asyncApiPromises && hasFallbackParams) {
    // We wrap each instance of params in a `new Promise()`, because deduping
    // them across requests doesn't work anyway and this let us show each
    // await a different set of values. This is important when all awaits
    // are in third party which would otherwise track all the way to the
    // internal params.
    const sharedParamsParent = isRuntimePrefetchable
      ? requestStore.asyncApiPromises.earlySharedParamsParent
      : requestStore.asyncApiPromises.sharedParamsParent
    const promise: Promise<Params> = new Promise((resolve, reject) => {
      sharedParamsParent.then(() => resolve(underlyingParams), reject)
    })
    // @ts-expect-error
    promise.displayName = 'params'
    return instrumentParamsPromiseWithDevWarnings(
      underlyingParams,
      promise,
      workStore
    )
  }

  const cachedParams = CachedParams.get(underlyingParams)
  if (cachedParams) {
    return cachedParams
  }

  // We don't use makeResolvedReactPromise here because params
  // supports copying with spread and we don't want to unnecessarily
  // instrument the promise with spreadable properties of ReactPromise.
  const promise = hasFallbackParams
    ? makeDevtoolsIOAwarePromise(
        underlyingParams,
        requestStore,
        RenderStage.Runtime
      )
    : // We don't want to force an environment transition when this params is not part of the fallback params set
      Promise.resolve(underlyingParams)

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
