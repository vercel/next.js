import { PostponedPathnameNormalizer } from './postponed'

describe('PostponedPathnameNormalizer', () => {
  describe('match', () => {
    it('should not match if it is disabled', () => {
      const pathnames = [
        '/_next/postponed/foo',
        '/_next/postponed/bar',
        '/_next/postponed/baz',
      ]
      const normalizer = new PostponedPathnameNormalizer(false)
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should match if it is enabled', () => {
      const pathnames = [
        '/_next/postponed/foo',
        '/_next/postponed/bar',
        '/_next/postponed/baz',
      ]
      const normalizer = new PostponedPathnameNormalizer(true)
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })

    it('should not match for other pathnames', () => {
      const pathnames = ['/_next/foo', '/_next/bar', '/_next/baz']
      const normalizer = new PostponedPathnameNormalizer(true)
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })
  })

  describe('normalize', () => {
    it('should not normalize if it is disabled', () => {
      const pathnames = [
        '/_next/postponed/foo',
        '/_next/postponed/bar',
        '/_next/postponed/baz',
      ]
      const normalizer = new PostponedPathnameNormalizer(false)
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should not normalize if it is enabled but not matched', () => {
      const pathnames = ['/_next/foo', '/_next/bar', '/_next/baz']
      const normalizer = new PostponedPathnameNormalizer(true)
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should normalize if it is enabled and matched', () => {
      const pathnames = ['/foo', '/bar', '/baz']
      const normalizer = new PostponedPathnameNormalizer(true)
      for (const pathname of pathnames) {
        expect(normalizer.normalize(`/_next/postponed${pathname}`, true)).toBe(
          pathname
        )
      }
    })

    it('should normalize `/index` to `/`', () => {
      const normalizer = new PostponedPathnameNormalizer(true)
      expect(normalizer.normalize('/_next/postponed/index', true)).toBe('/')
    })
  })
})
