import { SuffixPathnameNormalizer } from './suffix'

describe('SuffixPathnameNormalizer', () => {
  describe('match', () => {
    it('should return false if the pathname does not end with `.rsc`', () => {
      const normalizer = new SuffixPathnameNormalizer('.rsc')
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return true if it matches', () => {
      const normalizer = new SuffixPathnameNormalizer('.rsc')
      const pathnames = ['/foo.rsc', '/foo/bar.rsc', '/fooo/bar.rsc']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })
  })

  describe('normalize', () => {
    it('should return the same pathname if we are not matched and the pathname does not end with `.rsc`', () => {
      const normalizer = new SuffixPathnameNormalizer('.rsc')
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should strip the `.rsc` extension from the pathname when it matches', () => {
      const normalizer = new SuffixPathnameNormalizer('.rsc')
      const pathnames = ['/foo.rsc', '/foo/bar.rsc', '/fooo/bar.rsc']
      const expected = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(
          expected[pathnames.indexOf(pathname)]
        )
      }
    })
  })
})
