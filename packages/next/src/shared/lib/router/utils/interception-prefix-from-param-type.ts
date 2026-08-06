import type { DynamicParamTypes } from '../../app-router-types'

export function interceptionPrefixFromParamType(
  paramType: DynamicParamTypes
): string | null {
  switch (paramType) {
    case 'catchall-intercepted-(..)(..)':
    case 'dynamic-intercepted-(..)(..)':
      return '(..)(..)'
    case 'catchall-intercepted-(.)':
    case 'dynamic-intercepted-(.)':
      return '(.)'
    case 'catchall-intercepted-(..)':
    case 'dynamic-intercepted-(..)':
      return '(..)'
    case 'catchall-intercepted-(...)':
    case 'dynamic-intercepted-(...)':
      return '(...)'
    case 'catchall':
    case 'dynamic':
    case 'optional-catchall':
    default:
      return null
  }
}
