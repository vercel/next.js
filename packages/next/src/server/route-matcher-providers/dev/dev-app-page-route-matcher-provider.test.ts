import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import { RouteKind } from '../../route-kind'
import { DevAppPageRouteMatcherProvider } from './dev-app-page-route-matcher-provider'
import type { FileReader } from './helpers/file-reader/file-reader'

describe.each(['webpack', 'turbopack'])(
  'DevAppPageRouteMatcher %s',
  (bundler) => {
    const isTurbopack = bundler === 'turbopack'
    const dir = '<root>'
    const extensions = ['ts', 'tsx', 'js', 'jsx']

    it('returns no routes with an empty filesystem', async () => {
      const reader: FileReader = { read: jest.fn(() => []) }
      const provider = new DevAppPageRouteMatcherProvider(
        dir,
        extensions,
        reader,
        isTurbopack
      )
      const matchers = await provider.matchers()
      expect(matchers).toHaveLength(0)
      expect(reader.read).toHaveBeenCalledWith(dir)
    })

    describe('filename matching', () => {
      it.each<{
        files: ReadonlyArray<string>
        route: AppPageRouteDefinition
      }>([
        {
          files: [`${dir}/(marketing)/about/page.ts`],
          route: {
            kind: RouteKind.APP_PAGE,
            pathname: '/about',
            filename: `${dir}/(marketing)/about/page.ts`,
            page: '/(marketing)/about/page',
            bundlePath: 'app/(marketing)/about/page',
            appPaths: ['/(marketing)/about/page'],
          },
        },
        {
          files: [`${dir}/(marketing)/about/page.ts`],
          route: {
            kind: RouteKind.APP_PAGE,
            pathname: '/about',
            filename: `${dir}/(marketing)/about/page.ts`,
            page: '/(marketing)/about/page',
            bundlePath: 'app/(marketing)/about/page',
            appPaths: ['/(marketing)/about/page'],
          },
        },
        {
          files: [`${dir}/some/other/page.ts`],
          route: {
            kind: RouteKind.APP_PAGE,
            pathname: '/some/other',
            filename: `${dir}/some/other/page.ts`,
            page: '/some/other/page',
            bundlePath: 'app/some/other/page',
            appPaths: ['/some/other/page'],
          },
        },
        {
          files: [`${dir}/page.ts`],
          route: {
            kind: RouteKind.APP_PAGE,
            pathname: '/',
            filename: `${dir}/page.ts`,
            page: '/page',
            bundlePath: 'app/page',
            appPaths: ['/page'],
          },
        },
        {
          files: [`${dir}/%5Fnotignored/page.ts`],
          route: {
            kind: RouteKind.APP_PAGE,
            pathname: '/_notignored',
            filename: `${dir}/%5Fnotignored/page.ts`,
            page: `/${isTurbopack ? '_' : '%5F'}notignored/page`,
            bundlePath: `app/${isTurbopack ? '_' : '%5F'}notignored/page`,
            appPaths: [`/${isTurbopack ? '_' : '%5F'}notignored/page`],
          },
        },
      ])(
        "matches the '$route.page' route specified with the provided files",
        async ({ files, route }) => {
          const reader: FileReader = {
            read: jest.fn(() => [
              ...extensions.map((ext) => `${dir}/some/route.${ext}`),
              ...extensions.map((ext) => `${dir}/api/other.${ext}`),
              ...files,
            ]),
          }
          const provider = new DevAppPageRouteMatcherProvider(
            dir,
            extensions,
            reader,
            isTurbopack
          )
          const matchers = await provider.matchers()
          expect(matchers).toHaveLength(1)
          expect(reader.read).toHaveBeenCalledWith(dir)
          expect(matchers[0].definition).toEqual(route)
        }
      )
    })
  }
)
