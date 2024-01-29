import { NextDataPathnameNormalizer } from './next-data'

describe('NextDataPathnameNormalizer', () => {
  describe('constructor', () => {
    it('should error when no buildID is provided', () => {
      expect(() => {
        new NextDataPathnameNormalizer('')
      }).toThrowErrorMatchingInlineSnapshot(`"Invariant: buildID is required"`)
    })
  })

  describe('match', () => {
    it('should return false if the pathname does not start with the prefix', () => {
      const normalizer = new NextDataPathnameNormalizer('build-id')
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return false if the pathname only ends with `.json`', () => {
      const normalizer = new NextDataPathnameNormalizer('build-id')
      const pathnames = ['/foo.json', '/foo/bar.json', '/fooo/bar.json']
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(false)
      }
    })

    it('should return true if it matches', () => {
      const normalizer = new NextDataPathnameNormalizer('build-id')
      const pathnames = [
        '/_next/data/build-id/index.json',
        '/_next/data/build-id/foo.json',
        '/_next/data/build-id/foo/bar.json',
        '/_next/data/build-id/fooo/bar.json',
      ]
      for (const pathname of pathnames) {
        expect(normalizer.match(pathname)).toBe(true)
      }
    })
  })

  describe('normalize', () => {
    it('should return the same pathname if we are not matched and the pathname does not start with the prefix', () => {
      const normalizer = new NextDataPathnameNormalizer('build-id')
      const pathnames = ['/foo', '/foo/bar', '/fooo/bar']
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(pathname)
      }
    })

    it('should strip the prefix and the `.json` extension from the pathname when it matches', () => {
      const normalizer = new NextDataPathnameNormalizer('build-id')
      const pathnames = [
        '/_next/data/build-id/foo.json',
        '/_next/data/build-id/foo/bar.json',
        '/_next/data/build-id/fooo/bar.json',
      ]
      for (const pathname of pathnames) {
        expect(normalizer.normalize(pathname)).toBe(
          pathname.substring(
            '/_next/data/build-id'.length,
            pathname.length - '.json'.length
          )
        )
      }
    })

    it('should normalize `/index` to `/`', () => {
      const normalizer = new NextDataPathnameNormalizer('build-id')
      expect(normalizer.normalize('/_next/data/build-id/index.json')).toBe('/')
    })
  })
})
