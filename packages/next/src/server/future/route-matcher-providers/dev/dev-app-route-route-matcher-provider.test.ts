import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'
import { RouteKind } from '../../route-kind'
import { DevAppRouteRouteMatcherProvider } from './dev-app-route-route-matcher-provider'
import type { FileReader } from './helpers/file-reader/file-reader'

describe('DevAppRouteRouteMatcher', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader: FileReader = { read: jest.fn(() => []) }
    const matcher = new DevAppRouteRouteMatcherProvider(dir, extensions, reader)
    const matchers = await matcher.matchers()
    expect(matchers).toHaveLength(0)
    expect(reader.read).toHaveBeenCalledWith(dir)
  })

  describe('filename matching', () => {
    it.each<{
      files: ReadonlyArray<string>
      route: AppRouteRouteDefinition
    }>([
      {
        files: [`${dir}/some/other/route.ts`],
        route: {
          kind: RouteKind.APP_ROUTE,
          pathname: '/some/other',
          filename: `${dir}/some/other/route.ts`,
          page: '/some/other/route',
          bundlePath: 'app/some/other/route',
        },
      },
      {
        files: [`${dir}/route.ts`],
        route: {
          kind: RouteKind.APP_ROUTE,
          pathname: '/',
          filename: `${dir}/route.ts`,
          page: '/route',
          bundlePath: 'app/route',
        },
      },
    ])(
      "matches the '$route.page' route specified with the provided files",
      async ({ files, route }) => {
        const reader: FileReader = {
          read: jest.fn(() => [
            ...extensions.map((ext) => `${dir}/some/page.${ext}`),
            ...extensions.map((ext) => `${dir}/api/other.${ext}`),
            ...files,
          ]),
        }
        const matcher = new DevAppRouteRouteMatcherProvider(
          dir,
          extensions,
          reader
        )
        const matchers = await matcher.matchers()
        expect(matchers).toHaveLength(1)
        expect(reader.read).toHaveBeenCalledWith(dir)
        expect(matchers[0].definition).toEqual(route)
      }
    )
  })
})
