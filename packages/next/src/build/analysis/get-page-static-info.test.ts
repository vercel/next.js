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

    it('matches correct paths', () => {
      const matchers = ['/((?!_next/static).*)']
      const result = getMiddlewareMatchers(matchers, {
        i18n: undefined,
        basePath: undefined,
        assetPrefix: undefined,
      })[0].regexp
      const regex = new RegExp(result)
      expect(regex.test('/')).toBe(true)
      expect(regex.test('/post-1')).toBe(true)
      expect(regex.test('/_next/static/bundle.js')).toBe(false)
    })

    it('matches with basePath', () => {
      const matchers = ['/((?!_next/static).*)']
      const result = getMiddlewareMatchers(matchers, {
        i18n: undefined,
        basePath: '/base-path',
        // When a basePath has been set, the assetPrefix defaults to the basePath
        assetPrefix: '/base-path',
      })[0].regexp
      const regex = new RegExp(result)
      expect(regex.test('/')).toBe(false)
      expect(regex.test('/post-1')).toBe(false)
      expect(regex.test('/base-path')).toBe(true)
      expect(regex.test('/base-path/post-1')).toBe(true)
      expect(regex.test('/base-path/_next/static/bundle.js')).toBe(false)
    })

    it('matches with assetPrefix', () => {
      const matchers = ['/((?!_next/static).*)']
      const result = getMiddlewareMatchers(matchers, {
        i18n: undefined,
        assetPrefix: '/asset-prefix',
      })[0].regexp
      const regex = new RegExp(result)
      expect(regex.test('/')).toBe(true)
      expect(regex.test('/post-1')).toBe(true)
      expect(regex.test('/asset-prefix/_next/static/bundle.js')).toBe(false)
    })

    it('matches with absolute assetPrefix', () => {
      const matchers = ['/((?!_next/static).*)']
      const result = getMiddlewareMatchers(matchers, {
        i18n: undefined,
        assetPrefix: 'http://cdn.example.com/asset-prefix',
      })[0].regexp
      const regex = new RegExp(result)
      expect(regex.test('/')).toBe(true)
      expect(regex.test('/post-1')).toBe(true)
      expect(regex.test('/asset-prefix/_next/static/bundle.js')).toBe(false)
    })

    it('matches with basePath & assetPrefix', () => {
      const matchers = ['/((?!_next/static).*)']
      const result = getMiddlewareMatchers(matchers, {
        i18n: undefined,
        basePath: '/base-path',
        assetPrefix: '/asset-prefix',
      })[0].regexp
      const regex = new RegExp(result)
      expect(regex.test('/')).toBe(false)
      expect(regex.test('/post-1')).toBe(false)
      expect(regex.test('/base-path')).toBe(true)
      expect(regex.test('/base-path/post-1')).toBe(true)
      expect(regex.test('/asset-prefix/_next/static/bundle.js')).toBe(false)
    })

    it('matches /:id and /:id.json', () => {
      const matchers = ['/:id']
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })[0]
        .regexp
      const regex = new RegExp(result)
      expect(regex.test('/apple')).toBe(true)
      expect(regex.test('/apple.json')).toBe(true)
    })
  })
})
