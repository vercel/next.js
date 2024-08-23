import { trackFallbackParamAccessed } from '../../server/app-render/dynamic-rendering'
import { ReflectAdapter } from '../../server/web/spec-extension/adapters/reflect'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import type { Params } from './params'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'

export type FallbackRouteParams = ReadonlyMap<string, string>

export function getParamKeys(page: string) {
  const pattern = getRouteRegex(page)
  const matcher = getRouteMatcher(pattern)

  // Get the default list of allowed params.
  return Object.keys(matcher(page))
}

export function getFallbackRouteParams(
  pageOrKeys: string | readonly string[]
): FallbackRouteParams | null {
  let keys: readonly string[]
  if (typeof pageOrKeys === 'string') {
    keys = getParamKeys(pageOrKeys)
  } else {
    keys = pageOrKeys
  }

  // If there are no keys, we can return early.
  if (keys.length === 0) return null

  const params = new Map<string, string>()

  // As we're creating unique keys for each of the dynamic route params, we only
  // need to generate a unique ID once per request because each of the keys will
  // be also be unique.
  const uniqueID = Math.random().toString(16).slice(2)

  for (const key of keys) {
    params.set(key, `%%drp:${key}:${uniqueID}%%`)
  }

  return params
}

export type CreateDynamicallyTrackedParams =
  typeof createDynamicallyTrackedParams

export function createDynamicallyTrackedParams(params: Params): Params {
  const staticGenerationStore = staticGenerationAsyncStorage.getStore()

  // If we are not in a static generation context, we can just return the
  // params.
  if (!staticGenerationStore) return params

  // If there are no unknown route params, we can just return the params.
  const { fallbackRouteParams } = staticGenerationStore
  if (!fallbackRouteParams || fallbackRouteParams.size === 0) {
    return params
  }

  return new Proxy(params as Params, {
    get(target, prop, receiver) {
      // If the property is in the params object, we should track the access if
      // it's an unknown dynamic param.
      if (
        typeof prop === 'string' &&
        prop in params &&
        fallbackRouteParams.has(prop)
      ) {
        trackFallbackParamAccessed(staticGenerationStore, `params.${prop}`)
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (
        typeof prop === 'string' &&
        prop in params &&
        fallbackRouteParams.has(prop)
      ) {
        trackFallbackParamAccessed(staticGenerationStore, `params.${prop}`)
      }

      return ReflectAdapter.has(target, prop)
    },
    ownKeys(target) {
      for (const key in params) {
        if (fallbackRouteParams.has(key)) {
          trackFallbackParamAccessed(staticGenerationStore, 'params')
        }
      }

      return Reflect.ownKeys(target)
    },
  })
}
