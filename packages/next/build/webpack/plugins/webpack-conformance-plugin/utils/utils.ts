const assert = require('assert').strict

export function deepEqual(a: any, b: any) {
  try {
    assert.deepStrictEqual(a, b)
    return true
  } catch (_) {
    return false
  }
}
