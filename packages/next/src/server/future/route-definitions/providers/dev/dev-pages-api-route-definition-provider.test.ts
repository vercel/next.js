import { PosixMockFileReader } from '../../../helpers/file-reader/helpers/mock-file-reader'
import { RouteKind } from '../../../route-kind'
import { PagesAPIRouteDefinition } from '../../pages-api-route-definition'
import { DevPagesAPIRouteDefinitionProvider } from './dev-pages-api-route-definition-provider'

describe('DevPagesAPIRouteDefinitionProvider', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader = new PosixMockFileReader()
    const spy = jest.spyOn(reader, 'read')
    const provider = new DevPagesAPIRouteDefinitionProvider(
      dir,
      extensions,
      reader
    )
    const definitions = await provider.provide()
    expect(definitions).toHaveLength(0)
    expect(spy).toBeCalledWith(dir, { recursive: true })
  })

  describe('filename matching', () => {
    it.each<{
      files: ReadonlyArray<string>
      route: PagesAPIRouteDefinition
    }>([
      {
        files: [`${dir}/api/other/route.ts`],
        route: {
          kind: RouteKind.PAGES_API,
          identity: '/api/other/route',
          pathname: '/api/other/route',
          filename: `${dir}/api/other/route.ts`,
          page: '/api/other/route',
          bundlePath: 'pages/api/other/route',
        },
      },
      {
        files: [`${dir}/api/other/index.ts`],
        route: {
          kind: RouteKind.PAGES_API,
          identity: '/api/other',
          pathname: '/api/other',
          filename: `${dir}/api/other/index.ts`,
          page: '/api/other',
          bundlePath: 'pages/api/other',
        },
      },
      {
        files: [`${dir}/api.ts`],
        route: {
          kind: RouteKind.PAGES_API,
          identity: '/api',
          pathname: '/api',
          filename: `${dir}/api.ts`,
          page: '/api',
          bundlePath: 'pages/api',
        },
      },
      {
        files: [`${dir}/api/index.ts`],
        route: {
          kind: RouteKind.PAGES_API,
          identity: '/api',
          pathname: '/api',
          filename: `${dir}/api/index.ts`,
          page: '/api',
          bundlePath: 'pages/api',
        },
      },
    ])(
      "matches the '$route.page' route specified with the provided files",
      async ({ files, route }) => {
        const reader = new PosixMockFileReader([
          ...extensions.map((ext) => `${dir}/some/other/page.${ext}`),
          ...extensions.map((ext) => `${dir}/some/other/route.${ext}`),
          `${dir}/some/api/route.ts`,
          ...files,
        ])
        const spy = jest.spyOn(reader, 'read')
        const provider = new DevPagesAPIRouteDefinitionProvider(
          dir,
          extensions,
          reader
        )
        const definitions = await provider.provide()
        expect(definitions).toHaveLength(1)
        expect(spy).toBeCalledWith(dir, { recursive: true })
        expect(definitions[0]).toEqual(route)
      }
    )
  })
})
