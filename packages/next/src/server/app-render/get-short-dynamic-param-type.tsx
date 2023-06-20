import { DynamicParamTypes, DynamicParamTypesShort } from './types'

/**
 * Shorten the dynamic param in order to make it smaller when transmitted to the browser.
 */
export function getShortDynamicParamType(
  type: DynamicParamTypes
): DynamicParamTypesShort {
  switch (type) {
    case 'catchall':
      return 'c'
    case 'optional-catchall':
      return 'oc'
    case 'dynamic':
      return 'd'
    default:
      throw new Error('Unknown dynamic param type')
  }
}
