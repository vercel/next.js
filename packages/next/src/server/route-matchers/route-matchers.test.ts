import { Normalizer } from '../normalizers/normalizer'
import { RouteType } from '../route-matches/route-match'
import { RouteMatchers } from './route-matchers'

const request = (pathname: string) => ({ url: pathname })

describe('RouteMatchers', () => {
  it('will throw an error when used before compiled', () => {
    const matchers = new RouteMatchers()
    expect(() => matchers.match(request('/some/not/real/path'))).toThrow()
    matchers.compile()
    expect(() => matchers.match(request('/some/not/real/path'))).not.toThrow()
  })

  it('will not error and not match when no matchers are provided', () => {
    const matchers = new RouteMatchers()
    matchers.compile()
    expect(matchers.match(request('/some/not/real/path'))).toEqual(null)
  })

  it('tries to localize routes when provided', () => {
    const localeNormalizer: Normalizer = {
      normalize: jest.fn((pathname) => pathname),
    }
    const matchers = new RouteMatchers(localeNormalizer)
    matchers.compile()
    const pathname = '/some/not/real/path'
    expect(matchers.match(request(pathname))).toEqual(null)
    expect(localeNormalizer.normalize).toHaveBeenCalledWith(pathname)
  })

  describe('static routes', () => {
    it.each([
      ['/some/static/route', '<root>/some/static/route.js'],
      ['/some/other/static/route', '<root>/some/other/static/route.js'],
    ])('will match %s to %s', (pathname, filename) => {
      const matchers = new RouteMatchers()

      matchers.push({
        routes: () => [
          {
            type: RouteType.APP_PAGE,
            pathname: '/some/other/static/route',
            filename: '<root>/some/other/static/route.js',
          },
          {
            type: RouteType.APP_PAGE,
            pathname: '/some/static/route',
            filename: '<root>/some/static/route.js',
          },
        ],
      })

      matchers.compile()

      expect(matchers.match(request(pathname))).toEqual({
        type: RouteType.APP_PAGE,
        pathname,
        filename,
      })
    })
  })

  describe('dynamic routes', () => {
    it.each([
      {
        pathname: '/users/123',
        filename: '<root>/users/[id].js',
        params: { id: '123' },
      },
      {
        pathname: '/account/123',
        filename: '<root>/[...paths].js',
        params: { paths: ['account', '123'] },
      },
      {
        pathname: '/dashboard/account/123',
        filename: '<root>/[...paths].js',
        params: { paths: ['dashboard', 'account', '123'] },
      },
    ])(
      "will match '$pathname' to '$filename'",
      ({ pathname, filename, params }) => {
        const matchers = new RouteMatchers()

        matchers.push({
          routes: () => [
            {
              type: RouteType.APP_PAGE,
              pathname: '/[...paths]',
              filename: '<root>/[...paths].js',
            },
            {
              type: RouteType.APP_PAGE,
              pathname: '/users/[id]',
              filename: '<root>/users/[id].js',
            },
          ],
        })

        matchers.compile()

        expect(matchers.match(request(pathname))).toEqual({
          type: RouteType.APP_PAGE,
          filename,
          params,
        })
      }
    )
  })
})
