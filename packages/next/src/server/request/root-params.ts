import { InvariantError } from '../../shared/lib/invariant-error'
import {
  postponeWithTracking,
  throwToInterruptStaticGeneration,
} from '../app-render/dynamic-rendering'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import {
  workUnitAsyncStorage,
  type PrerenderStore,
  type PrerenderStoreLegacy,
  type PrerenderStorePPR,
} from '../app-render/work-unit-async-storage.external'
import { makeHangingPromise } from '../dynamic-rendering-utils'
import type { FallbackRouteParams } from './fallback-params'
import type { Params, ParamValue } from './params'
import {
  describeStringPropertyAccess,
  wellKnownProperties,
} from '../../shared/lib/utils/reflect-utils'

interface CacheLifetime {}
const CachedParams = new WeakMap<CacheLifetime, Promise<Params>>()

let didWarnAboutDeprecation = false
export async function unstable_rootParams(): Promise<Params> {
  if (!didWarnAboutDeprecation) {
    console.warn(
      '`unstable_rootParams` is deprecated and will be removed. Use `next/root-params` instead.'
    )
    didWarnAboutDeprecation = true
  }

  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError('Missing workStore in unstable_rootParams')
  }

  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workUnitStore) {
    throw new Error(
      `Route ${workStore.route} used \`unstable_rootParams()\` in Pages Router. This API is only available within App Router.`
    )
  }

  switch (workUnitStore.type) {
    case 'unstable-cache':
    case 'cache': {
      throw new Error(
        `Route ${workStore.route} used \`unstable_rootParams()\` inside \`"use cache"\` or \`unstable_cache\`. Support for this API inside cache scopes is planned for a future version of Next.js.`
      )
    }
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
      return createPrerenderRootParams(
        workUnitStore.rootParams,
        workStore,
        workUnitStore
      )
    default:
      return Promise.resolve(workUnitStore.rootParams)
  }
}

function createPrerenderRootParams(
  underlyingParams: Params,
  workStore: WorkStore,
  prerenderStore: PrerenderStore
): Promise<Params> {
  if (prerenderStore.type === 'prerender-client') {
    throw new InvariantError(
      `\`unstable_rootParams\` must not be used within a client component. Next.js should be preventing it from being included in client components statically, but did not in this case.`
    )
  }

  const fallbackParams = workStore.fallbackRouteParams
  if (fallbackParams) {
    let hasSomeFallbackParams = false
    for (const key in underlyingParams) {
      if (fallbackParams.has(key)) {
        hasSomeFallbackParams = true
        break
      }
    }

    if (hasSomeFallbackParams) {
      // params need to be treated as dynamic because we have at least one fallback param
      if (prerenderStore.type === 'prerender') {
        // We are in a dynamicIO prerender
        const cachedParams = CachedParams.get(underlyingParams)
        if (cachedParams) {
          return cachedParams
        }

        const promise = makeHangingPromise<Params>(
          prerenderStore.renderSignal,
          '`unstable_rootParams`'
        )
        CachedParams.set(underlyingParams, promise)

        return promise
      } else {
        // Remaining cases are prerender-ppr and prerender-legacy.

        // Typescript's type narrowing acts weird here here
        // and narrows `prerenderStore.type` but not `prerenderStore` itself,
        // so we assert on `type` and then cast it manually.
        prerenderStore.type satisfies 'prerender-ppr' | 'prerender-legacy'
        const nonDynamicIOPrerenderStore = prerenderStore as
          | PrerenderStorePPR
          | PrerenderStoreLegacy

        // We aren't in a dynamicIO prerender but we do have fallback params at this
        // level so we need to make an erroring params object which will postpone
        // if you access the fallback params
        return makeErroringRootParams(
          underlyingParams,
          fallbackParams,
          workStore,
          nonDynamicIOPrerenderStore
        )
      }
    }
  }

  // We don't have any fallback params so we have an entirely static safe params object
  return Promise.resolve(underlyingParams)
}

function makeErroringRootParams(
  underlyingParams: Params,
  fallbackParams: FallbackRouteParams,
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
            const expression = describeStringPropertyAccess(
              'unstable_rootParams',
              prop
            )
            // In most dynamic APIs we also throw if `dynamic = "error"` however
            // for params is only dynamic when we're generating a fallback shell
            // and even when `dynamic = "error"` we still support generating dynamic
            // fallback shells
            // TODO remove this comment when dynamicIO is the default since there
            // will be no `dynamic = "error"`
            if (prerenderStore.type === 'prerender-ppr') {
              // PPR Prerender (no dynamicIO)
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
      } else {
        ;(promise as any)[prop] = underlyingParams[prop]
      }
    }
  })

  return promise
}

/**
 * Used for the compiler-generated `next/root-params` module.
 * @internal
 */
export async function getRootParam(paramName: string): Promise<ParamValue> {
  const apiName = `\`import('next/root-params').${paramName}()\``

  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError(`Missing workStore in ${apiName}`)
  }

  const workUnitStore = workUnitAsyncStorage.getStore()

  if (!workUnitStore) {
    throw new Error(
      `Route ${workStore.route} used ${apiName} in Pages Router. This API is only available within App Router.`
    )
  }

  switch (workUnitStore.type) {
    case 'unstable-cache':
    case 'cache': {
      throw new Error(
        `Route ${workStore.route} used ${apiName} inside \`"use cache"\` or \`unstable_cache\`. Support for this API inside cache scopes is planned for a future version of Next.js.`
      )
    }
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
      return createPrerenderRootParam(
        paramName,
        workStore,
        workUnitStore,
        apiName
      )
    default:
      return Promise.resolve(workUnitStore.rootParams[paramName])
  }
}

function createPrerenderRootParam(
  paramName: string,
  workStore: WorkStore,
  prerenderStore: PrerenderStore,
  apiName: string
): Promise<ParamValue> {
  if (prerenderStore.type === 'prerender-client') {
    throw new InvariantError(
      `${apiName} must not be used within a client component. Next.js should be preventing it from being included in client components statically, but did not in this case.`
    )
  }

  const underlyingParams = prerenderStore.rootParams
  const fallbackParams = workStore.fallbackRouteParams

  if (fallbackParams && fallbackParams.has(paramName)) {
    // The param is a fallback, so it should be treated as dynamic.
    if (prerenderStore.type === 'prerender') {
      // We are in a dynamicIO prerender.
      return makeHangingPromise<ParamValue>(
        prerenderStore.renderSignal,
        apiName
      )
    } else {
      // Remaining cases are prerender-ppr and prerender-legacy.

      // Typescript's type narrowing acts weird here here
      // and narrows `prerenderStore.type` but not `prerenderStore` itself,
      // so we assert on `type` and then cast it manually.
      prerenderStore.type satisfies 'prerender-ppr' | 'prerender-legacy'
      const nonDynamicIOPrerenderStore = prerenderStore as
        | PrerenderStorePPR
        | PrerenderStoreLegacy

      // We aren't in a dynamicIO prerender, but the param is a fallback,
      // so we need to make an erroring params object which will postpone/error if you access it
      return makeErroringRootParam(
        paramName,
        workStore,
        nonDynamicIOPrerenderStore,
        apiName
      )
    }
  }

  // If the param is not a fallback param, we just return the statically available value.
  return Promise.resolve(underlyingParams[paramName])
}

function makeErroringRootParam(
  paramName: string,
  workStore: WorkStore,
  prerenderStore: PrerenderStorePPR | PrerenderStoreLegacy,
  apiName: string
): Promise<ParamValue> {
  const expression = describeStringPropertyAccess(apiName, paramName)
  // In most dynamic APIs, we also throw if `dynamic = "error"`.
  // However, root params are only dynamic when we're generating a fallback shell,
  // and even with `dynamic = "error"` we still support generating dynamic fallback shells.
  // TODO: remove this comment when dynamicIO is the default since there will be no `dynamic = "error"`

  // We don't want to error synchronously. Wrap the errors in a rejected promise instead.
  try {
    if (prerenderStore.type === 'prerender-ppr') {
      // PPR Prerender (no dynamicIO)
      postponeWithTracking(
        workStore.route,
        expression,
        prerenderStore.dynamicTracking
      )
    } else {
      // Legacy Prerender
      throwToInterruptStaticGeneration(expression, workStore, prerenderStore)
    }
  } catch (thrown) {
    return Promise.reject(thrown)
  }
}
