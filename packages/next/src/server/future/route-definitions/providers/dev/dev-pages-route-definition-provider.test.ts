import { PosixMockFileReader } from '../../../helpers/file-reader/helpers/mock-file-reader'
import { RouteKind } from '../../../route-kind'
import { PagesRouteDefinition } from '../../pages-route-definition'
import { DevPagesRouteDefinitionProvider } from './dev-pages-route-definition-provider'

describe('DevPagesRouteDefinitionProvider', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader = new PosixMockFileReader([])
    const spy = jest.spyOn(reader, 'read')
    const provider = new DevPagesRouteDefinitionProvider(
      dir,
      extensions,
      reader,
      null
    )
    const definitions = await provider.provide()
    expect(definitions).toHaveLength(0)
    expect(spy).toBeCalledTimes(1)
    expect(spy).toBeCalledWith(dir, { recursive: true })
  })

  describe('filename matching', () => {
    it.each<{
      files: ReadonlyArray<string>
      route: PagesRouteDefinition
    }>([
      {
        files: [`${dir}/index.ts`],
        route: {
          kind: RouteKind.PAGES,
          pathname: '/',
          filename: `${dir}/index.ts`,
          page: '/',
          bundlePath: 'pages/index',
        },
      },
      {
        files: [`${dir}/some/api/route.ts`],
        route: {
          kind: RouteKind.PAGES,
          pathname: '/some/api/route',
          filename: `${dir}/some/api/route.ts`,
          page: '/some/api/route',
          bundlePath: 'pages/some/api/route',
        },
      },
      {
        files: [`${dir}/some/other/route/index.ts`],
        route: {
          kind: RouteKind.PAGES,
          pathname: '/some/other/route',
          filename: `${dir}/some/other/route/index.ts`,
          page: '/some/other/route',
          bundlePath: 'pages/some/other/route',
        },
      },
      {
        files: [`${dir}/some/other/route/index/route.ts`],
        route: {
          kind: RouteKind.PAGES,
          pathname: '/some/other/route/index/route',
          filename: `${dir}/some/other/route/index/route.ts`,
          page: '/some/other/route/index/route',
          bundlePath: 'pages/some/other/route/index/route',
        },
      },
    ])(
      "matches the '$route.page' route specified with the provided files",
      async ({ files, route }) => {
        const reader = new PosixMockFileReader([
          ...extensions.map((ext) => `${dir}/api/other/page.${ext}`),
          ...files,
        ])
        const spy = jest.spyOn(reader, 'read')
        const provider = new DevPagesRouteDefinitionProvider(
          dir,
          extensions,
          reader,
          null
        )
        const definitions = await provider.provide()
        expect(definitions).toHaveLength(1)
        expect(spy).toBeCalledWith(dir, { recursive: true })
        expect(definitions[0]).toEqual(route)
      }
    )
  })
})
