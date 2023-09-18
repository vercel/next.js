import { PosixMockFileReader } from '../../../helpers/file-reader/helpers/mock-file-reader'
import { RouteKind } from '../../../route-kind'
import { AppRouteRouteDefinition } from '../../app-route-route-definition'
import { DevAppRouteRouteDefinitionProvider } from './dev-app-route-route-definition-provider'

describe('DevAppRouteRouteDefinitionProvider', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader = new PosixMockFileReader()
    const spy = jest.spyOn(reader, 'read')
    const provider = new DevAppRouteRouteDefinitionProvider(
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
      route: AppRouteRouteDefinition
    }>([
      {
        files: [`${dir}/some/other/route.ts`],
        route: {
          kind: RouteKind.APP_ROUTE,
          identity: '/some/other',
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
          identity: '/',
          pathname: '/',
          filename: `${dir}/route.ts`,
          page: '/route',
          bundlePath: 'app/route',
        },
      },
    ])(
      "matches the '$route.page' route specified with the provided files",
      async ({ files, route }) => {
        const reader = new PosixMockFileReader([
          ...extensions.map((ext) => `${dir}/some/other/page.${ext}`),
          ...extensions.map((ext) => `${dir}/api/other.${ext}`),
          ...files,
        ])
        const spy = jest.spyOn(reader, 'read')
        const provider = new DevAppRouteRouteDefinitionProvider(
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
