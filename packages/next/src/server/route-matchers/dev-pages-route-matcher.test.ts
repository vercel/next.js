import { Normalizer } from '../normalizers/normalizer'
import { RouteKind } from '../route-kind'
import { FileReader } from './file-reader/file-reader'
import { DevPagesRouteMatcher } from './dev-pages-route-matcher'

describe('DevPagesRouteMatcher', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader: FileReader = { read: jest.fn(() => []) }
    const localeNormalizer: Normalizer = {
      normalize: jest.fn((pathname) => pathname),
    }
    const matcher = new DevPagesRouteMatcher(
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
        filename: `${dir}/index.ts`,
        route: {
          kind: RouteKind.PAGES,
          pathname: '/',
          filename: `${dir}/index.ts`,
          page: '/',
          bundlePath: 'pages/index',
        },
      },
      {
        filename: `${dir}/some/api/route.ts`,
        route: {
          kind: RouteKind.PAGES,
          pathname: '/some/api/route',
          filename: `${dir}/some/api/route.ts`,
          page: '/some/api/route',
          bundlePath: 'pages/some/api/route',
        },
      },
      {
        filename: `${dir}/some/other/route/index.ts`,
        route: {
          kind: RouteKind.PAGES,
          pathname: '/some/other/route',
          filename: `${dir}/some/other/route/index.ts`,
          page: '/some/other/route',
          bundlePath: 'pages/some/other/route',
        },
      },
      {
        filename: `${dir}/some/other/route/index/route.ts`,
        route: {
          kind: RouteKind.PAGES,
          pathname: '/some/other/route/index/route',
          filename: `${dir}/some/other/route/index/route.ts`,
          page: '/some/other/route/index/route',
          bundlePath: 'pages/some/other/route/index/route',
        },
      },
    ])(
      "matches the route specified with '$filename'",
      async ({ filename, route }) => {
        const reader: FileReader = {
          read: jest.fn(() => [
            ...extensions.map((ext) => `${dir}/api/other/page.${ext}`),
            filename,
          ]),
        }
        const localeNormalizer: Normalizer = {
          normalize: jest.fn((pathname) => pathname),
        }
        const matcher = new DevPagesRouteMatcher(
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
