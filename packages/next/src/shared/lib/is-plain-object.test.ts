import { getObjectClassLabel, isPlainObject } from './is-plain-object'

describe('shared/lib/is-plain-object', () => {
  describe('getObjectClassLabel', () => {
    it('should return correct label for plain objects', () => {
      expect(getObjectClassLabel({})).toBe('[object Object]')
      expect(getObjectClassLabel({ a: 1 })).toBe('[object Object]')
    })

    it('should return correct label for arrays', () => {
      expect(getObjectClassLabel([])).toBe('[object Array]')
      expect(getObjectClassLabel([1, 2, 3])).toBe('[object Array]')
    })

    it('should return correct label for null', () => {
      expect(getObjectClassLabel(null)).toBe('[object Null]')
    })

    it('should return correct label for undefined', () => {
      expect(getObjectClassLabel(undefined)).toBe('[object Undefined]')
    })

    it('should return correct label for strings', () => {
      expect(getObjectClassLabel('hello')).toBe('[object String]')
      expect(getObjectClassLabel(new String('hello'))).toBe('[object String]')
    })

    it('should return correct label for numbers', () => {
      expect(getObjectClassLabel(123)).toBe('[object Number]')
      expect(getObjectClassLabel(new Number(123))).toBe('[object Number]')
    })

    it('should return correct label for functions', () => {
      expect(getObjectClassLabel(() => {})).toBe('[object Function]')
      expect(getObjectClassLabel(function () {})).toBe('[object Function]')
    })

    it('should return correct label for Date', () => {
      expect(getObjectClassLabel(new Date())).toBe('[object Date]')
    })

    it('should return correct label for RegExp', () => {
      expect(getObjectClassLabel(/test/)).toBe('[object RegExp]')
    })
  })

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true)
      expect(isPlainObject({ a: 1, b: 2 })).toBe(true)
      expect(isPlainObject({ nested: { obj: true } })).toBe(true)
    })

    it('should return true for Object.create(null)', () => {
      const obj = Object.create(null)
      expect(isPlainObject(obj)).toBe(true)
    })

    it('should return true for objects created with Object.create(Object.prototype)', () => {
      const obj = Object.create(Object.prototype)
      expect(isPlainObject(obj)).toBe(true)
    })

    it('should return false for arrays', () => {
      expect(isPlainObject([])).toBe(false)
      expect(isPlainObject([1, 2, 3])).toBe(false)
    })

    it('should return false for null', () => {
      expect(isPlainObject(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isPlainObject(undefined)).toBe(false)
    })

    it('should return false for strings', () => {
      expect(isPlainObject('hello')).toBe(false)
      expect(isPlainObject(new String('hello'))).toBe(false)
    })

    it('should return false for numbers', () => {
      expect(isPlainObject(123)).toBe(false)
      expect(isPlainObject(new Number(123))).toBe(false)
    })

    it('should return false for booleans', () => {
      expect(isPlainObject(true)).toBe(false)
      expect(isPlainObject(false)).toBe(false)
      expect(isPlainObject(new Boolean(true))).toBe(false)
    })

    it('should return false for functions', () => {
      expect(isPlainObject(() => {})).toBe(false)
      expect(isPlainObject(function () {})).toBe(false)
    })

    it('should return false for Date objects', () => {
      expect(isPlainObject(new Date())).toBe(false)
    })

    it('should return false for RegExp objects', () => {
      expect(isPlainObject(/test/)).toBe(false)
    })

    it('should return false for Error objects', () => {
      expect(isPlainObject(new Error('test'))).toBe(false)
    })

    it('should return false for class instances', () => {
      class MyClass {}
      expect(isPlainObject(new MyClass())).toBe(false)
    })

    it('should return false for class instances with properties', () => {
      class MyClass {
        prop = 'value'
      }
      expect(isPlainObject(new MyClass())).toBe(false)
    })

    it('should return false for Map', () => {
      expect(isPlainObject(new Map())).toBe(false)
    })

    it('should return false for Set', () => {
      expect(isPlainObject(new Set())).toBe(false)
    })

    it('should return false for WeakMap', () => {
      expect(isPlainObject(new WeakMap())).toBe(false)
    })

    it('should return false for WeakSet', () => {
      expect(isPlainObject(new WeakSet())).toBe(false)
    })

    it('should return false for Promise', () => {
      expect(isPlainObject(Promise.resolve())).toBe(false)
    })

    it('should handle objects with custom prototypes', () => {
      const proto = { customProp: true }
      const obj = Object.create(proto)
      // Should be false because prototype is not null or Object.prototype
      expect(isPlainObject(obj)).toBe(false)
    })

    it('should handle frozen objects', () => {
      const obj = Object.freeze({ a: 1 })
      expect(isPlainObject(obj)).toBe(true)
    })

    it('should handle sealed objects', () => {
      const obj = Object.seal({ a: 1 })
      expect(isPlainObject(obj)).toBe(true)
    })

    it('should handle objects with symbols', () => {
      const sym = Symbol('test')
      const obj = { [sym]: 'value' }
      expect(isPlainObject(obj)).toBe(true)
    })

    it('should handle objects with getters/setters', () => {
      const obj = {
        get value() {
          return 42
        },
        set value(v) {},
      }
      expect(isPlainObject(obj)).toBe(true)
    })
  })
})
