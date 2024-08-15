import { trackDynamicDataAccessed } from '../../server/app-render/dynamic-rendering'
import { ReflectAdapter } from '../../server/web/spec-extension/adapters/reflect'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { staticGenerationAsyncStorage } from './static-generation-async-storage.external'

export type UnknownDynamicRouteParams = ReadonlySet<string>
export type KnownDynamicRouteParams = ReadonlyMap<string, string | string[]>

export type DynamicRouteParams =
  | UnknownDynamicRouteParams
  | KnownDynamicRouteParams

/**
 * Returns true if the params represent parameters where the value is known.
 *
 * @param unknownRouteParams the unknown route params
 * @returns true if the params represent parameters where the value is known
 */
export function isKnownDynamicRouteParams(
  unknownRouteParams: DynamicRouteParams
): unknownRouteParams is KnownDynamicRouteParams {
  if (unknownRouteParams instanceof Map) return unknownRouteParams.size > 0
  return false
}

/**
 * Returns true if the params represent parameters where the value is unknown.
 *
 * @param unknownRouteParams the unknown route params
 * @returns true if the params represent parameters where the value is unknown
 */
export function isUnknownDynamicRouteParams(
  unknownRouteParams: DynamicRouteParams
): unknownRouteParams is UnknownDynamicRouteParams {
  if (unknownRouteParams instanceof Set) return unknownRouteParams.size > 0
  return false
}

export function getParamKeys(page: string) {
  const pattern = getRouteRegex(page)
  const matcher = getRouteMatcher(pattern)

  // Get the default list of allowed params.
  return Object.keys(matcher(page))
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
  const { unknownRouteParams, forceStatic } = staticGenerationStore
  if (!unknownRouteParams || !isUnknownDynamicRouteParams(unknownRouteParams)) {
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
        unknownRouteParams.has(prop)
      ) {
        trackDynamicDataAccessed(staticGenerationStore, `params.${prop}`)
      }

      return ReflectAdapter.get(target, prop, receiver)
    },
    has(target, prop) {
      if (
        typeof prop === 'string' &&
        prop in params &&
        unknownRouteParams.has(prop)
      ) {
        trackDynamicDataAccessed(staticGenerationStore, `params.${prop}`)
      }

      return ReflectAdapter.has(target, prop)
    },
    ownKeys(target) {
      for (const key in params) {
        if (unknownRouteParams.has(key)) {
          trackDynamicDataAccessed(staticGenerationStore, 'params')
        }
      }

      return Reflect.ownKeys(target)
    },
  })
}
