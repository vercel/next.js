import { getMiddlewareMatchers } from './get-page-static-info'

describe('get-page-static-infos', () => {
  describe('getMiddlewareMatchers', () => {
    it('sets originalSource with one matcher', () => {
      const matchers = '/middleware/path'
      const expected = [
        {
          originalSource: '/middleware/path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/path(\\.json)?[\\/#\\?]?$',
        },
      ]
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })
      expect(result).toStrictEqual(expected)
    })

    it('sets originalSource with multiple matchers', () => {
      const matchers = ['/middleware/path', '/middleware/another-path']
      const expected = [
        {
          originalSource: '/middleware/path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/path(\\.json)?[\\/#\\?]?$',
        },
        {
          originalSource: '/middleware/another-path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/another-path(\\.json)?[\\/#\\?]?$',
        },
      ]
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })
      expect(result).toStrictEqual(expected)
    })

    it('matches /:id and /:id.json', () => {
      const matchers = ['/:id']
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })[0]
        .regexp
      const regex = new RegExp(result)
      expect(regex.test('/apple')).toBe(true)
      expect(regex.test('/apple.json')).toBe(true)
    })

    it('prepends basePath to the compiled regex', () => {
      const matchers = [
        '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
      ]
      const result = getMiddlewareMatchers(matchers, {
        basePath: '/test',
        i18n: undefined,
      })[0].regexp
      const regex = new RegExp(result)
      // Regular subpaths should match
      expect(regex.test('/test/foo')).toBe(true)
      expect(regex.test('/test/bar')).toBe(true)
      // Excluded paths should not match
      expect(regex.test('/test/api')).toBe(false)
      expect(regex.test('/test/_next/static')).toBe(false)
    })

    it('basePath root does not match the negative-lookahead matcher without trailing slash', () => {
      // This documents the root cause of #73786: when basePath is set,
      // the compiled regex requires a "/" after the basePath, so the
      // bare basePath (root path) does not match. The fix is applied
      // at the matching call-site in resolve-routes.ts by also trying
      // with a trailing slash.
      const matchers = [
        '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
      ]
      const result = getMiddlewareMatchers(matchers, {
        basePath: '/test',
        i18n: undefined,
      })[0].regexp
      const regex = new RegExp(result)
      // Without trailing slash, the root path does NOT match the regex
      expect(regex.test('/test')).toBe(false)
      // With trailing slash, it matches
      expect(regex.test('/test/')).toBe(true)
    })
  })
})
