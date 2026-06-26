import { getMiddlewareMatchers } from './get-page-static-info'

describe('get-page-static-infos', () => {
  describe('getMiddlewareMatchers', () => {
    it('sets originalSource with one matcher', () => {
      const matchers = '/middleware/path'
      const expected = [
        {
          originalSource: '/middleware/path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/path(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$',
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
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/path(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$',
        },
        {
          originalSource: '/middleware/another-path',
          regexp:
            '^(?:\\/(_next\\/data\\/[^/]{1,}))?\\/middleware\\/another-path(\\.json|\\.rsc|\\.segments\\/.+\\.segment\\.rsc)?[\\/#\\?]?$',
        },
      ]
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })
      expect(result).toStrictEqual(expected)
    })

    it('matches /:id and transport variants for the same route', () => {
      const matchers = ['/:id']
      const result = getMiddlewareMatchers(matchers, { i18n: undefined })[0]
        .regexp
      const regex = new RegExp(result)
      expect(regex.test('/apple')).toBe(true)
      expect(regex.test('/apple.json')).toBe(true)
      expect(regex.test('/apple.rsc')).toBe(true)
    })

    it('matches App Router segment-prefetch routes for static matchers', () => {
      const regex = new RegExp(
        getMiddlewareMatchers('/dashboard', { i18n: undefined })[0].regexp
      )

      expect(regex.test('/dashboard.rsc')).toBe(true)
      expect(
        regex.test('/dashboard.segments/$c$children/__PAGE__.segment.rsc')
      ).toBe(true)
      expect(
        regex.test('/settings.segments/$c$children/__PAGE__.segment.rsc')
      ).toBe(false)
    })

    it('matches App Router segment-prefetch routes for nested matchers', () => {
      const regex = new RegExp(
        getMiddlewareMatchers('/dashboard/:path*', {
          i18n: undefined,
        })[0].regexp
      )

      expect(
        regex.test(
          '/dashboard/settings.segments/$c$children/__PAGE__.segment.rsc'
        )
      ).toBe(true)
      expect(
        regex.test(
          '/marketing/settings.segments/$c$children/__PAGE__.segment.rsc'
        )
      ).toBe(false)
    })

    it('matches the root App Router segment-prefetch transport route', () => {
      const regex = new RegExp(
        getMiddlewareMatchers('/', { i18n: undefined })[0].regexp
      )

      expect(regex.test('/index.rsc')).toBe(true)
      expect(
        regex.test('/index.segments/$c$children/__PAGE__.segment.rsc')
      ).toBe(true)
    })
  })
})
