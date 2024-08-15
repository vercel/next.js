import type { DynamicParamTypes, DynamicParamTypesShort } from './types'

export const dynamicParamTypes: Record<
  DynamicParamTypes,
  DynamicParamTypesShort
> = {
  catchall: 'c',
  'catchall-intercepted': 'ci',
  'optional-catchall': 'oc',
  dynamic: 'd',
  'dynamic-intercepted': 'di',
  'fallback-catchall': 'fc',
  'fallback-catchall-intercepted': 'fci',
  'fallback-optional-catchall': 'foc',
  'fallback-dynamic': 'fd',
  'fallback-dynamic-intercepted': 'fdi',
}

/**
 * Shorten the dynamic param in order to make it smaller when transmitted to the browser.
 */
export function getShortDynamicParamType(
  type: DynamicParamTypes
): DynamicParamTypesShort {
  const short = dynamicParamTypes[type]
  if (!short) {
    throw new Error('Unknown dynamic param type')
  }
  return short
}
