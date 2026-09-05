import type { DynamicParamTypesShort } from '../shared/lib/app-router-types'
import { getParamValueFromCacheKey } from './route-params'

describe('getParamValueFromCacheKey', () => {
  const catchAllTypes = [
    'c',
    'oc',
    'ci(.)',
    'ci(..)',
    'ci(..)(..)',
    'ci(...)',
  ] satisfies DynamicParamTypesShort[]

  it.each(catchAllTypes)('returns %s params as an array', (paramType) => {
    expect(getParamValueFromCacheKey('a/b', paramType)).toEqual(['a', 'b'])
  })

  const dynamicTypes = [
    'd',
    'di(.)',
    'di(..)',
    'di(..)(..)',
    'di(...)',
  ] satisfies DynamicParamTypesShort[]

  it.each(dynamicTypes)('returns %s params as a string', (paramType) => {
    expect(getParamValueFromCacheKey('a', paramType)).toBe('a')
  })
})
