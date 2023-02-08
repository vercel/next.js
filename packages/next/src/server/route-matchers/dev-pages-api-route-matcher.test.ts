import { Normalizer } from '../normalizers/normalizer'
import { RouteKind } from '../route-kind'
import { FileReader } from './file-reader/file-reader'
import { DevPagesAPIRouteMatcher } from './dev-pages-api-route-matcher'

describe('DevPagesAPIRouteMatcher', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader: FileReader = { read: jest.fn(() => []) }
    const localeNormalizer: Normalizer = {
      normalize: jest.fn((pathname) => pathname),
    }
    const matcher = new DevPagesAPIRouteMatcher(
      dir,
      extensions,
      localeNormalizer,
      reader
    )
    const routes = await matcher.routes()
    expect(routes).toHaveLength(0)
    expect(reader.read).toBeCalledWith(dir)
    expect(localeNormalizer.normalize).not.toHaveBeenCalled()
  })

  describe('filename matching', () => {
    it.each([
      {
        filename: `${dir}/api/other/route.ts`,
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api/other/route',
          filename: `${dir}/api/other/route.ts`,
          page: '/api/other/route',
          bundlePath: 'pages/api/other/route',
        },
      },
      {
        filename: `${dir}/api/other/index.ts`,
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api/other',
          filename: `${dir}/api/other/index.ts`,
          page: '/api/other',
          bundlePath: 'pages/api/other',
        },
      },
      {
        filename: `${dir}/api.ts`,
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api',
          filename: `${dir}/api.ts`,
          page: '/api',
          bundlePath: 'pages/api',
        },
      },
      {
        filename: `${dir}/api/index.ts`,
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api',
          filename: `${dir}/api/index.ts`,
          page: '/api',
          bundlePath: 'pages/api',
        },
      },
    ])(
      "matches the route specified with '$filename'",
      async ({ filename, route }) => {
        const reader: FileReader = {
          read: jest.fn(() => [
            ...extensions.map((ext) => `${dir}/some/other/page.${ext}`),
            ...extensions.map((ext) => `${dir}/some/other/route.${ext}`),
            `${dir}/some/api/route.ts`,
            filename,
          ]),
        }
        const localeNormalizer: Normalizer = {
          normalize: jest.fn((pathname) => pathname),
        }
        const matcher = new DevPagesAPIRouteMatcher(
          dir,
          extensions,
          localeNormalizer,
          reader
        )
        const routes = await matcher.routes()
        expect(routes).toHaveLength(1)
        expect(localeNormalizer.normalize).toHaveBeenCalledTimes(1)
        expect(reader.read).toBeCalledWith(dir)
        expect(routes[0]).toEqual(route)
      }
    )
  })
})
