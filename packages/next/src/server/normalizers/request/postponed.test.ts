import { PostponedPathnameNormalizer } from './postponed'

describe('PostponedPathnameNormalizer', () => {
  describe('match', () => {
    it('should match', () => {
      const pathnames = [
        '/_next/postponed/resume/foo',
        '/_next/postponed/resume/bar',
        '/_next/postponed/resume/baz',
      ]
      const normalizer = new PostponedPathnameNormalizer()
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })

    it('should not match for other pathnames', () => {
      const pathnames = ['/_next/foo', '/_next/bar', '/_next/baz']
      const normalizer = new PostponedPathnameNormalizer()
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })
  })

  describe('normalize', () => {
    it('should not normalize but not matched', () => {
      const pathnames = ['/_next/foo', '/_next/bar', '/_next/baz']
      const normalizer = new PostponedPathnameNormalizer()
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should normalize when matched', () => {
      const pathnames = ['/foo', '/bar', '/baz']
      const normalizer = new PostponedPathnameNormalizer()
      for (const pathname of pathnames) {
        expect(
          normalizer.normalize(`/_next/postponed/resume${pathname}`, true)
        ).toBe(pathname)
      }
    })

    it('should normalize `/index` to `/`', () => {
      const normalizer = new PostponedPathnameNormalizer()
      expect(normalizer.normalize('/_next/postponed/resume/index', true)).toBe(
        '/'
      )
    })
  })
})
