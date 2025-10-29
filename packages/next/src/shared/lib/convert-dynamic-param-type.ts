import type { DynamicParamTypesShort } from './app-router-types'

export function convertDynamicParamType(
  dynamicParamTypeShort: DynamicParamTypesShort,
  param: string
) {
  let result: string
  switch (dynamicParamTypeShort) {
    case 'c':
      result = `[...${param}]`
      break
    case 'ci(..)(..)':
    case 'ci(.)':
    case 'ci(..)':
    case 'ci(...)':
      result = `${dynamicParamTypeShort.slice(2)}[...${param}]`
      break
    case 'oc':
      result = `[[...${param}]]`
      break
    case 'd':
      result = `[${param}]`
      break
    case 'di(..)(..)':
    case 'di(.)':
    case 'di(..)':
    case 'di(...)':
      result = `${dynamicParamTypeShort.slice(2)}[${param}]`
      break
    default:
      dynamicParamTypeShort satisfies never
      result = ''
  }
  return result
}
