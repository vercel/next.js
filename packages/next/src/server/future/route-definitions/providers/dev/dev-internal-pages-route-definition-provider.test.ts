import { MockFileReader } from '../../../helpers/file-reader/helpers/mock-file-reader'
import { RouteKind } from '../../../route-kind'
import { InternalPagesRouteDefinition } from '../../internal-route-definition'
import { DevInternalPagesRouteDefinitionProvider } from './dev-internal-pages-route-definition-provider'

describe('DevInternalPagesRouteDefinitionProvider', () => {
  const dir = '/<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader = new MockFileReader()
    const spy = jest.spyOn(reader, 'read')
    const provider = new DevInternalPagesRouteDefinitionProvider(
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
      route: InternalPagesRouteDefinition | null
    }>([
      {
        files: [`${dir}/_error.ts`],
        route: {
          kind: RouteKind.INTERNAL_PAGES,
          pathname: '/_error',
          filename: `${dir}/_error.ts`,
          page: '/_error',
          bundlePath: '/_error',
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
        const provider = new DevInternalPagesRouteDefinitionProvider(
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
