type ValueType =
  | 'array'
  | 'bigint'
  | 'boolean'
  | 'function'
  | 'null'
  | 'number'
  | 'object'
  | 'regexp'
  | 'map'
  | 'set'
  | 'date'
  | 'string'
  | 'symbol'
  | 'undefined'

// get the type of a value with handling the edge cases like `typeof []`
// and `typeof null`
export function getType(value: unknown): ValueType {
  if (value === undefined) {
    return 'undefined'
  } else if (value === null) {
    return 'null'
  } else if (Array.isArray(value)) {
    return 'array'
  } else if (typeof value === 'boolean') {
    return 'boolean'
  } else if (typeof value === 'function') {
    return 'function'
  } else if (typeof value === 'number') {
    return 'number'
  } else if (typeof value === 'string') {
    return 'string'
  } else if (typeof value === 'bigint') {
    return 'bigint'
  } else if (typeof value === 'object') {
    if (value != null) {
      if (value.constructor === RegExp) {
        return 'regexp'
      } else if (value.constructor === Map) {
        return 'map'
      } else if (value.constructor === Set) {
        return 'set'
      } else if (value.constructor === Date) {
        return 'date'
      }
    }
    return 'object'
  } else if (typeof value === 'symbol') {
    return 'symbol'
  }

  throw new Error(`value of unknown type: ${value}`)
}
