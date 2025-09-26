import type { DynamicParamTypes } from '../../shared/lib/app-router-types'
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
  paramType: DynamicParamTypes,
  isParallelRouteParam: boolean
): FallbackRouteParam {
  return { paramName, paramType, isParallelRouteParam }
}
