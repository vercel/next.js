import { PrefetchRSCPathnameNormalizer } from './prefetch-rsc'

describe('PrefetchRSCPathnameNormalizer', () => {
  describe('match', () => {
    it('should return false if the pathname does not end with `.prefetch.rsc`', () => {
      const normalizer = new PrefetchRSCPathnameNormalizer(true)
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return true if it matches', () => {
      const normalizer = new PrefetchRSCPathnameNormalizer(true)
      const pathnames = [
        '/foo.prefetch.rsc',
        '/foo/bar.prefetch.rsc',
        '/fooo/bar.prefetch.rsc',
      ]
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })

    it('should return false if it is disabled but ends with .prefetch.rsc', () => {
      const normalizer = new PrefetchRSCPathnameNormalizer(false)
      const pathnames = [
        '/foo.prefetch.rsc',
        '/foo/bar.prefetch.rsc',
        '/fooo/bar.prefetch.rsc',
      ]
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return false if it only ends in .rsc', () => {
      const normalizer = new PrefetchRSCPathnameNormalizer(false)
      const pathnames = ['/foo.rsc', '/foo/bar.rsc', '/fooo/bar.rsc']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })
  })

  describe('normalize', () => {
    it('should return the same pathname if we are not matched and the pathname does not end with `.prefetch.rsc`', () => {
      const normalizer = new PrefetchRSCPathnameNormalizer(true)
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should strip the `.prefetch.rsc` extension from the pathname when it matches', () => {
      const normalizer = new PrefetchRSCPathnameNormalizer(true)
      const pathnames = [
        '/foo.prefetch.rsc',
        '/foo/bar.prefetch.rsc',
        '/fooo/bar.prefetch.rsc',
      ]
      const expected = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(
          expected[pathnames.indexOf(pathname)]
        )
      }
    })

    it('should return the same pathname if it is disabled but ends with .prefetch.rsc', () => {
      const normalizer = new PrefetchRSCPathnameNormalizer(false)
      const pathnames = [
        '/foo.prefetch.rsc',
        '/foo/bar.prefetch.rsc',
        '/fooo/bar.prefetch.rsc',
      ]
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })
  })
})
