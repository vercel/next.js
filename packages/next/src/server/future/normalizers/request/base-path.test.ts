import { BasePathPathnameNormalizer } from './base-path'

describe('BasePathPathnameNormalizer', () => {
  describe('match', () => {
    it('should return false if there is no basePath', () => {
      let normalizer = new BasePathPathnameNormalizer('')
      expect(normalizer.match('/')).toBe(false)
      normalizer = new BasePathPathnameNormalizer('/')
      expect(normalizer.match('/')).toBe(false)
    })

    it('should return false if the pathname does not start with the basePath', () => {
      const normalizer = new BasePathPathnameNormalizer('/foo')
      const pathnames = ['/bar', '/bar/foo', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return true if the pathname starts with the basePath', () => {
      const normalizer = new BasePathPathnameNormalizer('/foo')
      const pathnames = ['/foo', '/foo/bar', '/foo/bar/baz']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })
  })

  describe('normalize', () => {
    it('should return the same pathname if there is no basePath', () => {
      let normalizer = new BasePathPathnameNormalizer('')
      expect(normalizer.normalize('/foo')).toBe('/foo')
      normalizer = new BasePathPathnameNormalizer('/')
      expect(normalizer.normalize('/foo')).toBe('/foo')
    })

    it('should return the same pathname if we are not matched and the pathname does not start with the basePath', () => {
      const normalizer = new BasePathPathnameNormalizer('/foo')
      let pathnames = ['/bar', '/bar/foo', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should strip the basePath from the pathname when it matches', () => {
      const normalizer = new BasePathPathnameNormalizer('/foo')
      const pathnames = ['/foo', '/foo/bar', '/foo/bar/baz']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname.substring(4))
      }
    })
  })
})
