/* eslint-env jest */
import { cloneObject } from 'next/dist/server/config'

describe('cloneObject', () => {
  it('clones primitives as-is', () => {
    expect(cloneObject(42)).toBe(42)
    expect(cloneObject('hello')).toBe('hello')
    expect(cloneObject(true)).toBe(true)
    expect(cloneObject(null)).toBeNull()
  })

  it('deep-clones a plain object', () => {
    const original = { a: 1, b: { c: 2 } }
    const clone = cloneObject(original)
    expect(clone).toEqual(original)
    expect(clone).not.toBe(original)
    expect(clone.b).not.toBe(original.b)
  })

  it('deep-clones an array', () => {
    const original = [1, [2, 3], { x: 4 }]
    const clone = cloneObject(original)
    expect(clone).toEqual(original)
    expect(clone).not.toBe(original)
    expect(clone[1]).not.toBe(original[1])
  })

  it('clones RegExp', () => {
    const re = /foo/gi
    const clone = cloneObject(re)
    expect(clone).toEqual(re)
    expect(clone).not.toBe(re)
    expect(clone.source).toBe(re.source)
    expect(clone.flags).toBe(re.flags)
  })

  it('reuses function references', () => {
    const fn = () => 'hi'
    const obj = { fn }
    const clone = cloneObject(obj)
    expect(clone.fn).toBe(fn)
  })

  it('handles objects with circular references without throwing', () => {
    const obj: any = { a: 1 }
    obj.self = obj // circular reference
    expect(() => cloneObject(obj)).not.toThrow()
  })

  it('clone of circular object resolves self-reference to the clone (not the original)', () => {
    const obj: any = { a: 1 }
    obj.self = obj
    const clone = cloneObject(obj)
    expect(clone.a).toBe(1)
    // The self-reference on the clone should point back to the clone, not the original
    expect(clone.self).toBe(clone)
    expect(clone.self).not.toBe(obj)
  })

  it('handles mutually-referencing objects', () => {
    const a: any = { name: 'a' }
    const b: any = { name: 'b', ref: a }
    a.ref = b
    expect(() => cloneObject(a)).not.toThrow()
    const clone = cloneObject(a)
    expect(clone.name).toBe('a')
    expect(clone.ref.name).toBe('b')
    // clone.ref.ref should point back to the clone of a, not the original
    expect(clone.ref.ref).toBe(clone)
  })

  it('handles shared object references (diamond pattern)', () => {
    const shared = { value: 42 }
    const obj = { left: shared, right: shared }
    const clone = cloneObject(obj)
    // Both sides should reference the same cloned object
    expect(clone.left).toBe(clone.right)
    expect(clone.left).not.toBe(shared)
    expect(clone.left.value).toBe(42)
  })

  it('does not clone class instances (returns original)', () => {
    class Foo {
      x = 1
    }
    const foo = new Foo()
    const clone = cloneObject(foo)
    // Class instances are not plain objects — returned as-is
    expect(clone).toBe(foo)
  })
})
