import { RouteKind } from '../route-kind'
import { DevAppRouteRouteMatcher } from './dev-app-route-route-matcher'
import { FileReader } from './file-reader/file-reader'

describe('DevAppRouteRouteMatcher', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader: FileReader = { read: jest.fn(() => []) }
    const matcher = new DevAppRouteRouteMatcher(dir, extensions, reader)
    const routes = await matcher.routes()
    expect(routes).toHaveLength(0)
    expect(reader.read).toBeCalledWith(dir)
  })

  describe('filename matching', () => {
    it.each([
      {
        filename: `${dir}/some/other/route.ts`,
        route: {
          kind: RouteKind.APP_ROUTE,
          pathname: '/some/other',
          filename: `${dir}/some/other/route.ts`,
          page: '/some/other/route',
          bundlePath: 'app/some/other/route',
        },
      },
      {
        filename: `${dir}/route.ts`,
        route: {
          kind: RouteKind.APP_ROUTE,
          pathname: '/',
          filename: `${dir}/route.ts`,
          page: '/route',
          bundlePath: 'app/route',
        },
      },
    ])(
      "matches the route specified with '$filename'",
      async ({ filename, route }) => {
        const reader: FileReader = {
          read: jest.fn(() => [
            ...extensions.map((ext) => `${dir}/some/page.${ext}`),
            ...extensions.map((ext) => `${dir}/api/other.${ext}`),
            filename,
          ]),
        }
        const matcher = new DevAppRouteRouteMatcher(dir, extensions, reader)
        const routes = await matcher.routes()
        expect(routes).toHaveLength(1)
        expect(reader.read).toBeCalledWith(dir)
        expect(routes[0]).toEqual(route)
      }
    )
  })
})
