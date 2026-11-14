import { preLogSerializationClone, logStringify } from './forward-logs-utils'
import { patchConsoleMethod } from '../../shared/forward-logs-shared'

const safeStringify = (data: unknown) =>
  logStringify(preLogSerializationClone(data))

describe('forward-logs serialization', () => {
  describe('safeClone', () => {
    it('should handle primitive values and null', () => {
      expect(preLogSerializationClone(42)).toBe(42)
      expect(preLogSerializationClone('hello')).toBe('hello')
      expect(preLogSerializationClone(true)).toBe(true)
      expect(preLogSerializationClone(null)).toBe(null)
      expect(preLogSerializationClone(undefined)).toBe(
        '__next_tagged_undefined'
      )
    })

    it('should handle circular references', () => {
      const obj: any = { a: 1 }
      obj.self = obj
      const cloned = preLogSerializationClone(obj)
      expect(cloned.a).toBe(1)
      expect(cloned.self).toBe(cloned)
    })

    it('should handle promises', () => {
      const promise = Promise.resolve(42)
      expect(preLogSerializationClone(promise)).toBe('Promise {}')
    })

    it('should handle arrays', () => {
      const arr = [1, 'test', undefined, null]
      const cloned = preLogSerializationClone(arr)
      expect(cloned).toEqual([1, 'test', '__next_tagged_undefined', null])
    })

    it('should handle plain objects', () => {
      const obj = { a: 1, b: undefined, c: 'test' }
      const cloned = preLogSerializationClone(obj)
      expect(cloned).toEqual({ a: 1, b: '__next_tagged_undefined', c: 'test' })
    })

    it('should handle objects with getters that throw', () => {
      const obj = {
        normalProp: 'works',
        get throwingGetter() {
          throw new Error('Getter throws')
        },
      }

      const cloned = preLogSerializationClone(obj)
      expect(cloned.normalProp).toBe('works')
      expect(cloned.throwingGetter).toBe('[Unable to view]')
    })

    it('should handle non-plain objects as toString', () => {
      const date = new Date('2023-01-01')
      const regex = /test/gi
      const error = new Error('Test error')

      expect(preLogSerializationClone(date)).toBe('[object Date]')
      expect(preLogSerializationClone(regex)).toBe('[object RegExp]')
      expect(preLogSerializationClone(error)).toBe('[object Error]')
    })

    it('should handle array items that throw', () => {
      const throwingProxy = new Proxy(
        {},
        {
          get() {
            throw new Error('Proxy throws')
          },
        }
      )

      const arr = [1, throwingProxy, 'normal']
      const cloned = preLogSerializationClone(arr)

      expect(cloned).toEqual([1, '[Unable to view]', 'normal'])
    })
  })

  describe('logStringify', () => {
    it('should stringify safe cloned data', () => {
      expect(safeStringify(42)).toBe('42')
      expect(safeStringify('hello')).toBe('"hello"')
      expect(safeStringify(null)).toBe('null')
      expect(safeStringify(undefined)).toBe(`"__next_tagged_undefined"`)
    })

    it('should handle objects with circular references', () => {
      const obj: any = { a: 1 }
      obj.self = obj
      const result = safeStringify(obj)
      expect(typeof result).toBe('string')
      expect(result).toContain('"a":1')
    })

    it('should return UNAVAILABLE_MARKER on stringify failure', () => {
      const problematicData = {
        toJSON() {
          throw new Error('toJSON throws')
        },
      }

      const result = safeStringify(problematicData)
      expect(result).toBe(`"[Unable to view]"`)
    })
  })

  describe('values that trap the clone itself', () => {
    it('should handle a proxy whose getPrototypeOf throws', () => {
      const proxy = new Proxy(
        { a: 1 },
        {
          getPrototypeOf() {
            throw new Error('getPrototypeOf throws')
          },
        }
      )

      expect(preLogSerializationClone(proxy)).toBe('[Unable to view]')
    })

    it('should handle a value whose Symbol.toStringTag getter throws', () => {
      const value = {
        get [Symbol.toStringTag](): string {
          throw new Error('toStringTag throws')
        },
      }
      // Give it a non-plain prototype so the clone falls through to
      // `Object.prototype.toString`.
      Object.setPrototypeOf(value, Object.create(Object.prototype))

      expect(preLogSerializationClone(value)).toBe('[Unable to view]')
    })
  })

  describe('patchConsoleMethod', () => {
    it('should still call the original method when the wrapper throws', () => {
      const original = jest.fn()
      const descriptor = Object.getOwnPropertyDescriptor(console, 'log')!
      Object.defineProperty(console, 'log', { ...descriptor, value: original })

      const restore = patchConsoleMethod('log', () => {
        throw new Error('wrapper blew up')
      })

      expect(() => console.log('user message', 42)).not.toThrow()
      expect(original).toHaveBeenCalledWith('user message', 42)

      restore()
      Object.defineProperty(console, 'log', descriptor)
    })
  })
})
