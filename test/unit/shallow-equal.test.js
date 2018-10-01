/* global describe, it, expect */

import shallowEquals from 'next-server/dist/lib/shallow-equals'

describe('Shallow Equals', () => {
  it('should be true if both objects are the same', () => {
    const a = { aa: 10 }
    expect(shallowEquals(a, a)).toBe(true)
  })

  it('should be true if both objects are similar', () => {
    const a = { aa: 10, bb: 30 }
    const b = { aa: 10, bb: 30 }
    expect(shallowEquals(a, b)).toBe(true)
  })

  it('should be false if objects have different keys', () => {
    const a = { aa: 10, bb: 30 }
    const b = { aa: 10, cc: 50 }
    expect(shallowEquals(a, b)).toBe(false)
  })

  it('should be false if objects have same keys but different values', () => {
    const a = { aa: 10, bb: 30 }
    const b = { aa: 10, bb: 50 }
    expect(shallowEquals(a, b)).toBe(false)
  })

  it('should be false if objects matched deeply', () => {
    const a = { aa: 10, bb: { a: 10 } }
    const b = { aa: 10, bb: { a: 10 } }
    expect(shallowEquals(a, b)).toBe(false)
  })
})
