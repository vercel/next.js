import { Normalizer } from '../normalizers/normalizer'
import { RouteKind } from '../route-kind'
import { DefaultRouteMatcherManager } from './default-route-matcher-manager'

describe('DefaultRouteMatcherManager', () => {
  it('will throw an error when used before compiled', async () => {
    const matchers = new DefaultRouteMatcherManager()
    expect(
      async () => await matchers.match('/some/not/real/path')
    ).not.toThrow()
    matchers.push({ routes: jest.fn(async () => []) })
    await expect(matchers.match('/some/not/real/path')).rejects.toThrow()
    await matchers.compile()
    await expect(matchers.match('/some/not/real/path')).resolves.toEqual(null)
  })

  it('will not error and not match when no matchers are provided', async () => {
    const matchers = new DefaultRouteMatcherManager()
    await matchers.compile()
    expect(await matchers.match('/some/not/real/path')).toEqual(null)
  })

  it('tries to localize routes when provided', async () => {
    const localeNormalizer: Normalizer = {
      normalize: jest.fn((pathname) => pathname),
    }
    const matchers = new DefaultRouteMatcherManager(localeNormalizer)
    await matchers.compile()
    const pathname = '/some/not/real/path'
    expect(await matchers.match(pathname)).toEqual(null)
    expect(localeNormalizer.normalize).toHaveBeenCalledWith(pathname)
  })

  describe('static routes', () => {
    it.each([
      ['/some/static/route', '<root>/some/static/route.js'],
      ['/some/other/static/route', '<root>/some/other/static/route.js'],
    ])('will match %s to %s', async (pathname, filename) => {
      const matchers = new DefaultRouteMatcherManager()

      matchers.push({
        routes: async () => [
          {
            kind: RouteKind.APP_PAGE,
            pathname: '/some/other/static/route',
            filename: '<root>/some/other/static/route.js',
            bundlePath: '<bundle path>',
            page: '<page>',
          },
          {
            kind: RouteKind.APP_PAGE,
            pathname: '/some/static/route',
            filename: '<root>/some/static/route.js',
            bundlePath: '<bundle path>',
            page: '<page>',
          },
        ],
      })

      await matchers.compile()

      expect(await matchers.match(pathname)).toEqual({
        kind: RouteKind.APP_PAGE,
        pathname,
        filename,
        bundlePath: '<bundle path>',
        page: '<page>',
      })
    })
  })

  describe('dynamic routes', () => {
    it.each([
      {
        pathname: '/users/123',
        route: {
          pathname: '/users/[id]',
          filename: '<root>/users/[id].js',
          params: { id: '123' },
        },
      },
      {
        pathname: '/account/123',
        route: {
          pathname: '/[...paths]',
          filename: '<root>/[...paths].js',
          params: { paths: ['account', '123'] },
        },
      },
      {
        pathname: '/dashboard/users/123',
        route: {
          pathname: '/[...paths]',
          filename: '<root>/[...paths].js',
          params: { paths: ['dashboard', 'users', '123'] },
        },
      },
    ])(
      "will match '$pathname' to '$route.filename'",
      async ({ pathname, route }) => {
        const matchers = new DefaultRouteMatcherManager()

        matchers.push({
          routes: async () => [
            {
              kind: RouteKind.APP_PAGE,
              pathname: '/[...paths]',
              filename: '<root>/[...paths].js',
              bundlePath: '<bundle path>',
              page: '<page>',
            },
            {
              kind: RouteKind.APP_PAGE,
              pathname: '/users/[id]',
              filename: '<root>/users/[id].js',
              bundlePath: '<bundle path>',
              page: '<page>',
            },
          ],
        })

        await matchers.compile()

        expect(await matchers.match(pathname)).toEqual({
          kind: RouteKind.APP_PAGE,
          bundlePath: '<bundle path>',
          page: '<page>',
          ...route,
        })
      }
    )
  })
})
