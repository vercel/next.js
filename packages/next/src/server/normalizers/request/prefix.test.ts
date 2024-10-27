import { PrefixPathnameNormalizer } from './prefix'

describe('PrefixPathnameNormalizer', () => {
  describe('match', () => {
    it('should return false if the pathname does not start with the prefix', () => {
      const normalizer = new PrefixPathnameNormalizer('/foo')
      const pathnames = ['/bar', '/bar/foo', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return true if the pathname starts with the prefix', () => {
      const normalizer = new PrefixPathnameNormalizer('/foo')
      const pathnames = ['/foo', '/foo/bar', '/foo/bar/baz']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })
  })

  it('should throw if the prefix ends with a slash', () => {
    expect(() => new PrefixPathnameNormalizer('/foo/')).toThrow()
    expect(() => new PrefixPathnameNormalizer('/')).toThrow()
  })

  describe('normalize', () => {
    it('should return the same pathname if we are not matched and the pathname does not start with the prefix', () => {
      const normalizer = new PrefixPathnameNormalizer('/foo')
      let pathnames = ['/bar', '/bar/foo', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should strip the prefix from the pathname when it matches', () => {
      const normalizer = new PrefixPathnameNormalizer('/foo')
      const pathnames = ['/foo', '/foo/bar', '/foo/bar/baz']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(
          pathname.substring(4) || '/'
        )
      }
    })
  })
})
