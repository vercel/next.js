import { getProperError } from './is-error'

describe.each(['development', 'production'] as const)(
  'getProperError (%s)',
  (mode) => {
    beforeEach(() => {
      jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: mode })
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it.each([
      [Symbol('render failed'), 'Symbol(render failed)'],
      [Symbol(), 'Symbol()'],
      [Symbol.for('registered failure'), 'Symbol(registered failure)'],
      [Symbol.iterator, 'Symbol(Symbol.iterator)'],
    ])('normalizes a thrown symbol %s', (value, message) => {
      const error = getProperError(value)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe(message)
    })

    it.each([
      ['render failed', 'render failed'],
      ['', ''],
      [0, '0'],
      [42, '42'],
      [NaN, 'NaN'],
      [true, 'true'],
      [false, 'false'],
      [BigInt(42), '42'],
    ])('preserves primitive coercion for %p', (value, message) => {
      expect(getProperError(value).message).toBe(message)
    })

    it('preserves an existing error', () => {
      const error = new Error('render failed')

      expect(getProperError(error)).toBe(error)
    })

    it('preserves an error-like object', () => {
      const error = { name: 'CustomError', message: 'render failed' }

      expect(getProperError(error)).toBe(error)
    })

    it('serializes a plain object', () => {
      expect(getProperError({ reason: 'render failed' }).message).toBe(
        '{"reason":"render failed"}'
      )
    })

    it('serializes a circular object', () => {
      const value: { reason: string; self?: unknown } = {
        reason: 'render failed',
      }
      value.self = value

      expect(getProperError(value).message).toBe(
        '{"reason":"render failed","self":"[Circular]"}'
      )
    })

    it('preserves valueOf coercion for a class instance', () => {
      class ThrownValue {
        valueOf() {
          return 42
        }

        toString() {
          return 'render failed'
        }
      }

      expect(getProperError(new ThrownValue()).message).toBe('42')
    })

    it('preserves the default hint for custom primitive coercion', () => {
      class ThrownValue {
        [Symbol.toPrimitive](hint: string) {
          return hint
        }
      }

      expect(getProperError(new ThrownValue()).message).toBe('default')
    })

    it.each([
      [undefined, 'An undefined'],
      [null, 'A null'],
    ])('preserves the message for %p', (value, prefix) => {
      const message =
        mode === 'development'
          ? `${prefix} error was thrown, see here for more info: https://nextjs.org/docs/messages/threw-undefined`
          : String(value)

      expect(getProperError(value).message).toBe(message)
    })
  }
)
