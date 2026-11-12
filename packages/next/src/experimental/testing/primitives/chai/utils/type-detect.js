export function type(obj) {
  if (typeof obj === 'undefined') {
    return 'undefined'
  }

  if (obj === null) {
    return 'null'
  }

  const stringTag = /** @type {Record<PropertyKey, unknown>} */ (obj)[
    Symbol.toStringTag
  ]
  if (typeof stringTag === 'string') {
    return stringTag
  }
  const tag = Object.prototype.toString.call(obj).slice(8, -1)
  return tag
}
