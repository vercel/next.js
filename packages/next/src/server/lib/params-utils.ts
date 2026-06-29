import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import type { Params } from '../request/params'

export function hasNonRootStaticParams(
  params: Params,
  rootParams: Params,
  fallbackParams: OpaqueFallbackRouteParams | null | undefined
) {
  for (const paramName in params) {
    if (
      !Object.hasOwn(rootParams, paramName) &&
      isStaticParam(paramName, fallbackParams)
    ) {
      return true
    }
  }
  return false
}

function isStaticParam(
  paramName: string,
  fallbackParams: OpaqueFallbackRouteParams | null | undefined
) {
  // NOTE: Assume that undefined fallback params mean that all of the params are static.
  if (!fallbackParams) return true
  // If the param isn't a fallback param, it must be static.
  return !fallbackParams.has(paramName)
}

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
