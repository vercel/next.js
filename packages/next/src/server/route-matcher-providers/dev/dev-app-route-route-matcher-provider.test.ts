import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'
import { RouteKind } from '../../route-kind'
import { DevAppRouteRouteMatcherProvider } from './dev-app-route-route-matcher-provider'
import type { FileReader } from './helpers/file-reader/file-reader'

describe.each(['webpack', 'turbopack'])(
  'DevAppRouteRouteMatcher %s',
  (bundler) => {
    const isTurbopack = bundler === 'turbopack'
    const dir = '<root>'
    const extensions = ['ts', 'tsx', 'js', 'jsx']

    it('returns no routes with an empty filesystem', async () => {
      const reader: FileReader = { read: jest.fn(() => []) }
      const matcher = new DevAppRouteRouteMatcherProvider(
        dir,
        extensions,
        reader,
        isTurbopack
      )
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
        {
          files: [`${dir}/%5Fnotignored/route.ts`],
          route: {
            kind: RouteKind.APP_ROUTE,
            pathname: '/_notignored',
            filename: `${dir}/%5Fnotignored/route.ts`,
            page: `/${isTurbopack ? '_' : '%5F'}notignored/route`,
            bundlePath: `app/${isTurbopack ? '_' : '%5F'}notignored/route`,
          },
        },
      ])(
        "matches the '$route.page' route specified with the provided files",
        async ({ files, route }) => {
          console.log({ files })

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
            reader,
            isTurbopack
          )
          const matchers = await matcher.matchers()
          expect(matchers).toHaveLength(1)
          expect(reader.read).toHaveBeenCalledWith(dir)
          expect(matchers[0].definition).toEqual(route)
        }
      )
    })

    it('reuses unchanged matchers and evicts removed files', async () => {
      const ignored = `${dir}/page.ts`
      const one = `${dir}/one/route.ts`
      const two = `${dir}/two/route.ts`
      const metadata = `${dir}/sitemap.ts`
      let files: ReadonlyArray<string> = [ignored, one, metadata]
      const reader: FileReader = { read: jest.fn(() => files) }
      const provider = new DevAppRouteRouteMatcherProvider(
        dir,
        extensions,
        reader,
        isTurbopack
      )

      const initial = await provider.matchers()
      expect(initial).toHaveLength(3)

      files = [ignored, one, two, metadata]
      const expanded = await provider.matchers()
      expect(expanded).toHaveLength(4)
      expect(expanded[0]).toBe(initial[0])
      expect(expanded[2]).toBe(initial[1])
      expect(expanded[3]).toBe(initial[2])

      files = [ignored, two, metadata]
      const reduced = await provider.matchers()
      expect(reduced[0]).toBe(expanded[1])
      expect(reduced[1]).toBe(initial[1])
      expect(reduced[2]).toBe(initial[2])

      files = [ignored, one, two, metadata]
      const readded = await provider.matchers()
      expect(readded[0]).not.toBe(initial[0])
      expect(readded[1]).toBe(expanded[1])
      expect(readded[2]).toBe(initial[1])
      expect(readded[3]).toBe(initial[2])
    })
  }
)
