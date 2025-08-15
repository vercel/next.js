import type { FallbackRouteParam } from './types'

/**
 * Encodes a parameter value using the provided encoder.
 *
 * @param value - The value to encode.
 * @param encoder - The encoder to use.
 * @returns The encoded value.
 */
export function encodeParam(
  value: string | string[],
  encoder: (value: string) => string
) {
  let replaceValue: string
  if (Array.isArray(value)) {
    replaceValue = value.map(encoder).join('/')
  } else {
    replaceValue = encoder(value)
  }

  return replaceValue
}

/**
 * Normalizes a pathname to a consistent format.
 *
 * @param pathname - The pathname to normalize.
 * @returns The normalized pathname.
 */
export function normalizePathname(pathname: string) {
  return pathname.replace(/\\/g, '/').replace(/(?!^)\/$/, '')
}

/**
 * Creates a fallback route param.
 *
 * @param paramName - The name of the param.
 * @param isParallelRouteParam - Whether this is a parallel route param or
 * descends from a parallel route param.
 * @returns The fallback route param.
 */
export function createFallbackRouteParam(
  paramName: string,
  isParallelRouteParam: boolean
): FallbackRouteParam {
  return { paramName, isParallelRouteParam }
}

/**
 * Filters out all the parallel route params from the fallback route params.
 *
 * @param fallbackRouteParams - The fallback route params to filter.
 * @returns The filtered fallback route params.
 */
export function filterNonParallelFallbackRouteParams(
  fallbackRouteParams: readonly FallbackRouteParam[]
): readonly FallbackRouteParam[] {
  return fallbackRouteParams.filter((param) => !param.isParallelRouteParam)
}
