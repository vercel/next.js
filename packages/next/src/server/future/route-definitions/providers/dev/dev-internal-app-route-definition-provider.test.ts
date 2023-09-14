import { MockFileReader } from '../../../helpers/file-reader/helpers/mock-file-reader'
import { RouteKind } from '../../../route-kind'
import { InternalAppRouteDefinition } from '../../internal-route-definition'
import { DevInternalAppRouteDefinitionProvider } from './dev-internal-app-route-definition-provider'

describe('DevInternalAppRouteDefinitionProvider', () => {
  const dir = '/<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader = new MockFileReader()
    const spy = jest.spyOn(reader, 'read')
    const provider = new DevInternalAppRouteDefinitionProvider(
      dir,
      extensions,
      reader
    )
    const definitions = await provider.provide()
    expect(definitions).toHaveLength(1)
    expect(spy).toBeCalledWith(dir, { recursive: true })
    expect(definitions[0].builtIn).toBe(true)
  })

  describe('filename matching', () => {
    it.each<{
      files: ReadonlyArray<string>
      route: InternalAppRouteDefinition
    }>([
      {
        files: [`${dir}/not-found.ts`],
        route: {
          kind: RouteKind.INTERNAL_APP,
          pathname: '/not-found',
          filename: `${dir}/not-found.ts`,
          page: '/not-found',
          bundlePath: 'app/not-found',
          builtIn: false,
        },
      },
    ])(
      "matches the '$route.page' route specified with the provided files",
      async ({ files, route }) => {
        const reader = new MockFileReader([
          ...extensions.map((ext) => `${dir}/some/route.${ext}`),
          ...extensions.map((ext) => `${dir}/api/other.${ext}`),
          ...files,
        ])
        const spy = jest.spyOn(reader, 'read')
        const provider = new DevInternalAppRouteDefinitionProvider(
          dir,
          extensions,
          reader
        )
        const definitions = await provider.provide()

        expect(definitions).toHaveLength(2)
        expect(spy).toBeCalledWith(dir, { recursive: true })
        expect(definitions[0]).toEqual(route)
      }
    )
  })
})
