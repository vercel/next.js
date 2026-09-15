import { formatNextPathnameInfo } from './format-next-pathname-info'

describe('formatNextPathnameInfo', () => {
  describe('data routes (buildId set)', () => {
    it('should format the locale-prefixed root page as `{locale}.json`', () => {
      expect(
        formatNextPathnameInfo({
          pathname: '/',
          locale: 'fr',
          buildId: 'BUILD_ID',
          trailingSlash: false,
        })
      ).toBe('/_next/data/BUILD_ID/fr.json')
    })

    it('should format the root page without a locale as `index.json`', () => {
      expect(
        formatNextPathnameInfo({
          pathname: '/',
          buildId: 'BUILD_ID',
          trailingSlash: false,
        })
      ).toBe('/_next/data/BUILD_ID/index.json')
    })

    it('should format a locale-prefixed non-root page as `{locale}/{page}.json`', () => {
      expect(
        formatNextPathnameInfo({
          pathname: '/about',
          locale: 'fr',
          buildId: 'BUILD_ID',
          trailingSlash: false,
        })
      ).toBe('/_next/data/BUILD_ID/fr/about.json')
    })

    it('should format a non-root page without a locale as `{page}.json`', () => {
      expect(
        formatNextPathnameInfo({
          pathname: '/about',
          buildId: 'BUILD_ID',
          trailingSlash: false,
        })
      ).toBe('/_next/data/BUILD_ID/about.json')
    })
  })

  describe('regular routes (no buildId)', () => {
    it('should keep the root page as `/` when no locale is given', () => {
      expect(
        formatNextPathnameInfo({
          pathname: '/',
          trailingSlash: false,
        })
      ).toBe('/')
    })

    it('should prefix the root page with the locale', () => {
      expect(
        formatNextPathnameInfo({
          pathname: '/',
          locale: 'fr',
          trailingSlash: false,
        })
      ).toBe('/fr')
    })
  })
})
