import { trackDynamicDataAccessed } from '../../server/app-render/dynamic-rendering'
import { ReflectAdapter } from '../../server/web/spec-extension/adapters/reflect'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'
import crypto from 'crypto'

export type DynamicRouteParams = ReadonlyMap<string, string>

export function getParamKeys(page: string) {
  const pattern = getRouteRegex(page)
  const matcher = getRouteMatcher(pattern)

  // Get the default list of allowed params.
  return Object.keys(matcher(page))
}

export function getDynamicRouteParams(
  keys: readonly string[]
): DynamicRouteParams
export function getDynamicRouteParams(page: string): DynamicRouteParams
export function getDynamicRouteParams(
  pageOrKeys: string | readonly string[]
): DynamicRouteParams {
  let keys: readonly string[]
  if (typeof pageOrKeys === 'string') {
    keys = getParamKeys(pageOrKeys)
  } else {
    keys = pageOrKeys
  }

  const params = new Map<string, string>()

  for (const key of keys) {
    params.set(key, `${key}:${crypto.randomUUID()}`)
  }

  return params
}

export type Params = Record<string, string | string[] | undefined>

export type CreateDynamicallyTrackedParams =
  typeof createDynamicallyTrackedParams

export function createDynamicallyTrackedParams(params: Params): Params {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  // If we are not in a static generation context, we can just return the
  // params.
  if (!staticGenerationStore) return params

  // If there are no unknown route params, we can just return the params.
  const { fallbackRouteParams, forceStatic } = staticGenerationStore
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    return params
  }

  // If we are in force static mode, we should return the params as is.
  if (forceStatic) return params

  return new Proxy(params as Params, {
    get(target, prop, receiver) {
      // If the property is in the params object, we should track the access if
      // it's an unknown dynamic param.
      if (
        typeof prop === 'string' &&
        prop in params &&
        fallbackRouteParams.has(prop)
      ) {
        trackDynamicDataAccessed(staticGenerationStore, `params.${prop}`)
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (
        typeof prop === 'string' &&
        prop in params &&
        fallbackRouteParams.has(prop)
      ) {
        trackDynamicDataAccessed(staticGenerationStore, `params.${prop}`)
      }

      return ReflectAdapter.has(target, prop)
    },
    ownKeys(target) {
      for (const key in params) {
        if (fallbackRouteParams.has(key)) {
          trackDynamicDataAccessed(staticGenerationStore, 'params')
        }
      }

      return Reflect.ownKeys(target)
    },
  })
}
