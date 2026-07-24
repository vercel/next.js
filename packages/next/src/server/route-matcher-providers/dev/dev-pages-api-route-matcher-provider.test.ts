import path from 'path'
import type { PagesAPIRouteDefinition } from '../../route-definitions/pages-api-route-definition'
import { RouteKind } from '../../route-kind'
import { DevPagesAPIRouteMatcherProvider } from './dev-pages-api-route-matcher-provider'
import type { FileReader } from './helpers/file-reader/file-reader'

const normalizeSlashes = (p: string) => p.replace(/\//g, path.sep)

describe('DevPagesAPIRouteMatcherProvider', () => {
  const dir = '<root>'
  const extensions = ['ts', 'tsx', 'js', 'jsx']

  it('returns no routes with an empty filesystem', async () => {
    const reader: FileReader = { read: jest.fn(() => []) }
    const matcher = new DevPagesAPIRouteMatcherProvider(dir, extensions, reader)
    const matchers = await matcher.matchers()
    expect(matchers).toHaveLength(0)
    expect(reader.read).toHaveBeenCalledWith(dir)
  })

  describe('filename matching', () => {
    it.each<{
      files: ReadonlyArray<string>
      route: PagesAPIRouteDefinition
    }>([
      {
        files: [normalizeSlashes(`${dir}/api/other/route.ts`)],
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api/other/route',
          filename: normalizeSlashes(`${dir}/api/other/route.ts`),
          page: '/api/other/route',
          bundlePath: 'pages/api/other/route',
        },
      },
      {
        files: [normalizeSlashes(`${dir}/api/other/index.ts`)],
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api/other',
          filename: normalizeSlashes(`${dir}/api/other/index.ts`),
          page: '/api/other',
          bundlePath: 'pages/api/other',
        },
      },
      {
        files: [normalizeSlashes(`${dir}/api.ts`)],
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api',
          filename: normalizeSlashes(`${dir}/api.ts`),
          page: '/api',
          bundlePath: 'pages/api',
        },
      },
      {
        files: [normalizeSlashes(`${dir}/api/index.ts`)],
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api',
          filename: normalizeSlashes(`${dir}/api/index.ts`),
          page: '/api',
          bundlePath: 'pages/api',
        },
      },
    ])(
      "matches the '$route.page' route specified with the provided files",
      async ({ files, route }) => {
        const reader: FileReader = {
          read: jest.fn(() => [
            ...extensions.map((ext) => `${dir}/some/other/page.${ext}`),
            ...extensions.map((ext) => `${dir}/some/other/route.${ext}`),
            `${dir}/some/api/route.ts`,
            ...files,
          ]),
        }
        const matcher = new DevPagesAPIRouteMatcherProvider(
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

  it('reuses unchanged matchers and evicts removed files', async () => {
    const ignored = normalizeSlashes(`${dir}/index.ts`)
    const one = normalizeSlashes(`${dir}/api/one.ts`)
    const two = normalizeSlashes(`${dir}/api/two.ts`)
    const three = normalizeSlashes(`${dir}/api/three.ts`)
    let files: ReadonlyArray<string> = [ignored, one, two]
    const reader: FileReader = { read: jest.fn(() => files) }
    const provider = new DevPagesAPIRouteMatcherProvider(
      dir,
      extensions,
      reader
    )

    const initial = await provider.matchers()

    files = [ignored, one, two, three]
    const expanded = await provider.matchers()
    expect(expanded[0]).toBe(initial[0])
    expect(expanded[1]).toBe(initial[1])

    files = [ignored, one, three]
    const reduced = await provider.matchers()
    expect(reduced[0]).toBe(initial[0])
    expect(reduced[1]).toBe(expanded[2])

    files = [ignored, one, two, three]
    const readded = await provider.matchers()
    expect(readded[0]).toBe(initial[0])
    expect(readded[1]).not.toBe(initial[1])
    expect(readded[2]).toBe(expanded[2])
  })
})
