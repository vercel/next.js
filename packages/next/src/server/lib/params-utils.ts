import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import type { Params } from '../request/params'

export function allParamsAreRootParams(
  underlyingParams: Params,
  rootParams: Params
) {
  for (const paramName in underlyingParams) {
    if (!Object.hasOwn(rootParams, paramName)) {
      return false
    }
  }
  return true
}

export function isEmptyParams(params: Params): boolean {
  for (const _paramKey in params) {
    return false
  }
  return true
}

export function hasFallbackRouteParams(
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
