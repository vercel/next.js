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
  })
})
