import { RouteKind } from '../route-kind'
import { DevAppPageRouteMatcher } from './dev-app-page-route-matcher'
import { FileReader } from './file-reader/file-reader'

describe('DevAppPageRouteMatcher', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader: FileReader = { read: jest.fn(() => []) }
    const matcher = new DevAppPageRouteMatcher(dir, extensions, reader)
    const routes = await matcher.routes()
    expect(routes).toHaveLength(0)
    expect(reader.read).toBeCalledWith(dir)
  })

  describe('filename matching', () => {
    it.each([
      {
        filename: `${dir}/(marketing)/about/page.ts`,
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/about',
          filename: `${dir}/(marketing)/about/page.ts`,
          page: '/(marketing)/about/page',
          bundlePath: 'app/(marketing)/about/page',
        },
      },
      {
        filename: `${dir}/some/other/page.ts`,
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/some/other',
          filename: `${dir}/some/other/page.ts`,
          page: '/some/other/page',
          bundlePath: 'app/some/other/page',
        },
      },
      {
        filename: `${dir}/page.ts`,
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/',
          filename: `${dir}/page.ts`,
          page: '/page',
          bundlePath: 'app/page',
        },
      },
    ])(
      "matches the route specified with '$filename'",
      async ({ filename, route }) => {
        const reader: FileReader = {
          read: jest.fn(() => [
            ...extensions.map((ext) => `${dir}/some/route.${ext}`),
            ...extensions.map((ext) => `${dir}/api/other.${ext}`),
            filename,
          ]),
        }
        const matcher = new DevAppPageRouteMatcher(dir, extensions, reader)
        const routes = await matcher.routes()
        expect(routes).toHaveLength(1)
        expect(reader.read).toBeCalledWith(dir)
        expect(routes[0]).toEqual(route)
      }
    )
  })
})
