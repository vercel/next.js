import { deepFreeze, deepFreezePlainValues } from './deep-freeze'

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

describe('deepFreezePlainValues', () => {
  it('should freeze nested plain objects and arrays', () => {
    const obj = { a: [{ b: 1 }], c: { d: [2] } }
    deepFreezePlainValues(obj)
    expect(Object.isFrozen(obj)).toBe(true)
    expect(Object.isFrozen(obj.a)).toBe(true)
    expect(Object.isFrozen(obj.a[0])).toBe(true)
    expect(Object.isFrozen(obj.c)).toBe(true)
    expect(Object.isFrozen(obj.c.d)).toBe(true)
  })

  it('should leave class instances and their contents unfrozen', () => {
    class Holder {
      value = { nested: true }
    }
    const pattern = /a/g
    const holder = new Holder()
    const obj = { pattern, holder, list: [pattern] }
    deepFreezePlainValues(obj)

    expect(Object.isFrozen(obj)).toBe(true)
    expect(Object.isFrozen(obj.list)).toBe(true)
    expect(Object.isFrozen(pattern)).toBe(false)
    expect(Object.isFrozen(holder)).toBe(false)
    expect(Object.isFrozen(holder.value)).toBe(false)
    // A frozen global RegExp would throw when `test` writes `lastIndex`.
    expect(pattern.test('a')).toBe(true)
  })

  it('should type plain values as readonly and keep functions callable', () => {
    class Plugin {
      value = 1
    }
    const frozen = deepFreezePlainValues({
      nested: { value: 1 },
      list: [1],
      pattern: /a/g,
      run: () => 1,
      Plugin,
    })

    expect(() => {
      // @ts-expect-error -- plain objects are readonly
      frozen.nested.value = 2
    }).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error -- arrays are readonly
      frozen.list.push(2)
    }).toThrow(TypeError)

    // Functions and methods stay callable, and classes stay constructable.
    expect(frozen.run()).toBe(1)
    expect(frozen.pattern.test('a')).toBe(true)
    expect(new frozen.Plugin().value).toBe(1)
    expect(Object.isFrozen(frozen.Plugin)).toBe(false)

    // The RegExp is not frozen, but its properties are still typed as
    // readonly, which is stricter than its runtime behavior.
    // @ts-expect-error -- typed readonly even though the RegExp is not frozen
    frozen.pattern.lastIndex = 0
  })
})
