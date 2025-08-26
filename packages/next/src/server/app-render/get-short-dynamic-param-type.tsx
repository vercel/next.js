import type {
  DynamicParamTypes,
  DynamicParamTypesShort,
} from '../../shared/lib/app-router-types'

export const dynamicParamTypes: Record<
  DynamicParamTypes,
  DynamicParamTypesShort
> = {
  catchall: 'c',
  'catchall-intercepted': 'ci',
  'optional-catchall': 'oc',
  dynamic: 'd',
  'dynamic-intercepted': 'di',
}
