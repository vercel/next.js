import { deepFreeze } from './deep-freeze'

describe('freeze', () => {
  it('should freeze an object', () => {
    const obj = { a: 1, b: 2 }
    deepFreeze(obj)
    expect(Object.isFrozen(obj)).toBe(true)
  })

  it('should freeze an array', () => {
    const arr = [1, 2, 3]
    deepFreeze(arr)
    expect(Object.isFrozen(arr)).toBe(true)
  })

  it('should freeze nested objects', () => {
    const obj = { a: { b: 2 }, c: 3 }
    deepFreeze(obj)
    expect(Object.isFrozen(obj)).toBe(true)
    expect(Object.isFrozen(obj.a)).toBe(true)
  })

  it('should freeze nested arrays', () => {
    const arr = [
      [1, 2],
      [3, 4],
    ]
    deepFreeze(arr)
    expect(Object.isFrozen(arr)).toBe(true)
    expect(Object.isFrozen(arr[0])).toBe(true)
    expect(Object.isFrozen(arr[1])).toBe(true)
  })

  it('should freeze nested objects and arrays', () => {
    const obj = { a: [1, 2], b: { c: 3 } }
    deepFreeze(obj)
    expect(Object.isFrozen(obj)).toBe(true)
    expect(Object.isFrozen(obj.a)).toBe(true)
    expect(Object.isFrozen(obj.b)).toBe(true)
  })
})
