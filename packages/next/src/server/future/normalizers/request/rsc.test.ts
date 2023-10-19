import { RSCPathnameNormalizer } from './rsc'

describe('RSCPathnameNormalizer', () => {
  describe('match', () => {
    it('should return false if the pathname does not end with `.rsc`', () => {
      const normalizer = new RSCPathnameNormalizer(true)
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return true if it matches', () => {
      const normalizer = new RSCPathnameNormalizer(true)
      const pathnames = ['/foo.rsc', '/foo/bar.rsc', '/fooo/bar.rsc']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })

    it('should return false if it is disabled but ends with .rsc', () => {
      const normalizer = new RSCPathnameNormalizer(false)
      const pathnames = ['/foo.rsc', '/foo/bar.rsc', '/fooo/bar.rsc']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })
  })

  describe('normalize', () => {
    it('should return the same pathname if we are not matched and the pathname does not end with `.rsc`', () => {
      const normalizer = new RSCPathnameNormalizer(true)
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should strip the `.rsc` extension from the pathname when it matches', () => {
      const normalizer = new RSCPathnameNormalizer(true)
      const pathnames = ['/foo.rsc', '/foo/bar.rsc', '/fooo/bar.rsc']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(
          pathname.substring(0, pathname.length - '.rsc'.length)
        )
      }
    })

    it('should return the same pathname if it is disabled but ends with .rsc', () => {
      const normalizer = new RSCPathnameNormalizer(false)
      const pathnames = ['/foo.rsc', '/foo/bar.rsc', '/fooo/bar.rsc']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })
  })
})
