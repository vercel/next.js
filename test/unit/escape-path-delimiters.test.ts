/* eslint-env jest */
import escapePathDelimiters from 'next/dist/shared/lib/router/utils/escape-path-delimiters'

describe('escapePathDelimiters', () => {
  describe('valid string inputs', () => {
    it('should escape forward slashes', () => {
      expect(escapePathDelimiters('foo/bar')).toBe('foo%2Fbar')
    })

    it('should escape hash characters', () => {
      expect(escapePathDelimiters('foo#bar')).toBe('foo%23bar')
    })

    it('should escape question marks', () => {
      expect(escapePathDelimiters('foo?bar')).toBe('foo%3Fbar')
    })

    it('should return unchanged string without delimiters', () => {
      expect(escapePathDelimiters('foobar')).toBe('foobar')
    })

    it('should handle empty string', () => {
      expect(escapePathDelimiters('')).toBe('')
    })

    it('should escape encoded characters when escapeEncoded is true', () => {
      expect(escapePathDelimiters('%2f', true)).toBe('%252f')
      expect(escapePathDelimiters('%23', true)).toBe('%2523')
      expect(escapePathDelimiters('%3f', true)).toBe('%253f')
    })
  })

  describe('invalid non-string inputs', () => {
    it('should throw an error when passed a number', () => {
      expect(() => {
        // @ts-expect-error testing invalid input
        escapePathDelimiters(123)
      }).toThrow(/A path segment must be a string, received number \(123\)/)
    })

    it('should throw an error when passed an object', () => {
      expect(() => {
        // @ts-expect-error testing invalid input
        escapePathDelimiters({ foo: 'bar' })
      }).toThrow(/A path segment must be a string, received object/)
    })

    it('should throw an error when passed null', () => {
      expect(() => {
        escapePathDelimiters(null as unknown as string)
      }).toThrow(/A path segment must be a string, received object \(null\)/)
    })

    it('should throw an error when passed undefined', () => {
      expect(() => {
        escapePathDelimiters(undefined as unknown as string)
      }).toThrow(/A path segment must be a string, received undefined/)
    })

    it('should throw an error when passed an array', () => {
      expect(() => {
        // @ts-expect-error testing invalid input
        escapePathDelimiters(['foo', 'bar'])
      }).toThrow(/A path segment must be a string, received object/)
    })

    it('should include helpful message about getStaticPaths', () => {
      expect(() => {
        // @ts-expect-error testing invalid input
        escapePathDelimiters(42)
      }).toThrow(
        /This typically happens when a non-string value is passed to getStaticPaths/
      )
    })
  })
})
