import { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import { PagesLocaleRouteDefinition } from '../route-definitions/pages-route-definition'
import { RouteDefinition } from '../route-definitions/route-definition'
import { RouteKind } from '../route-kind'
import { RouteMatcherProvider } from '../route-matcher-providers/route-matcher-provider'
import { DefaultRouteMatcher } from '../route-matchers/default-route-matcher'
import { LocaleRouteMatcher } from '../route-matchers/locale-route-matcher'
import { DefaultRouteMatcherManager } from './default-route-matcher-manager'
import { MatchOptions } from './route-matcher-manager'

describe('DefaultRouteMatcherManager', () => {
  it('will throw an error when used before it has been reloaded', async () => {
    const manager = new DefaultRouteMatcherManager()
    await expect(
      manager.match('/some/not/real/path', {
        i18n: undefined,
        matchedOutputPathname: undefined,
      })
    ).resolves.toEqual(null)
    manager.push({ matchers: jest.fn(async () => []) })
    await expect(
      manager.match('/some/not/real/path', {
        i18n: undefined,
        matchedOutputPathname: undefined,
      })
    ).rejects.toThrow()
    await manager.load()
    await expect(
      manager.match('/some/not/real/path', {
        i18n: undefined,
        matchedOutputPathname: undefined,
      })
    ).resolves.toEqual(null)
  })

  it('will not error and not match when no matchers are provided', async () => {
    const manager = new DefaultRouteMatcherManager()
    await manager.load()
    await expect(
      manager.match('/some/not/real/path', {
        i18n: undefined,
        matchedOutputPathname: undefined,
      })
    ).resolves.toEqual(null)
  })

  describe('static and dynamic matching', () => {
    it.each<{
      pathname: string
      options: MatchOptions
      definitions: ReadonlyArray<RouteDefinition>
      expected:
        | {
            filename: string
            params: Record<string, string>
          }
        | undefined
    }>([
      {
        pathname: '/some/[slug]/path',
        options: { i18n: undefined, matchedOutputPathname: undefined },
        definitions: [],
        expected: undefined,
      },
      {
        pathname: '/some/[slug]/path',
        options: { i18n: undefined, matchedOutputPathname: undefined },
        definitions: [
          {
            kind: RouteKind.APP_PAGE,
            filename: 'MATCH',
            bundlePath: '',
            page: '',
            pathname: '/some/[slug]/path',
          },
        ],
        expected: { filename: 'MATCH', params: { slug: '[slug]' } },
      },
    ])(
      'can handle matching $pathname',
      async ({ pathname, options, definitions, expected }) => {
        const manager = new DefaultRouteMatcherManager()
        const matchers = definitions.map((d) => new DefaultRouteMatcher(d))
        const provider: RouteMatcherProvider = {
          matchers: jest.fn(async () => matchers),
        }
        manager.push(provider)
        await manager.load()

        const match = await manager.match(pathname, options)
        if (expected) {
          expect(match?.definition.filename).toEqual(expected?.filename)
          expect(match?.params).toEqual(expected?.params)
        } else {
          expect(match).toEqual(null)
        }
      }
    )
  })

  it.each<{
    pathname: string
    options: MatchOptions
    definition: LocaleRouteDefinition
  }>([
    {
      pathname: '/nl-NL/some/path',
      options: {
        i18n: {
          detectedLocale: 'nl-NL',
          pathname: '/some/path',
          inferredFromDefault: false,
        },
        matchedOutputPathname: undefined,
      },
      definition: {
        kind: RouteKind.PAGES,
        filename: '',
        bundlePath: '',
        page: '',
        pathname: '/nl-NL/some/path',
        i18n: {
          pathname: '/some/path',
          detectedLocale: 'nl-NL',
        },
      },
    },
    {
      pathname: '/en-US/some/path',
      options: {
        i18n: {
          detectedLocale: 'en-US',
          pathname: '/some/path',
          inferredFromDefault: false,
        },
        matchedOutputPathname: undefined,
      },
      definition: {
        kind: RouteKind.PAGES,
        filename: '',
        bundlePath: '',
        page: '',
        pathname: '/en-US/some/path',
        i18n: {
          detectedLocale: 'en-US',
          pathname: '/some/path',
        },
      },
    },
    {
      pathname: '/some/path',
      options: {
        i18n: {
          detectedLocale: undefined,
          pathname: '/some/path',
          inferredFromDefault: false,
        },
        matchedOutputPathname: undefined,
      },
      definition: {
        kind: RouteKind.PAGES,
        filename: '',
        bundlePath: '',
        page: '',
        pathname: '/en-US/some/path',
        i18n: {
          detectedLocale: 'en-US',
          pathname: '/some/path',
        },
      },
    },
  ])(
    'can handle locale aware matchers for $pathname and locale $options.i18n.detectedLocale',
    async ({ pathname, options, definition }) => {
      const manager = new DefaultRouteMatcherManager()

      const matcher = new LocaleRouteMatcher(definition)
      const provider: RouteMatcherProvider = {
        matchers: jest.fn(async () => [matcher]),
      }
      manager.push(provider)
      await manager.load()

      const match = await manager.match(pathname, options)
      expect(match?.definition).toBe(definition)
    }
  )

  it('calls the locale route matcher when one is provided', async () => {
    const manager = new DefaultRouteMatcherManager()
    const definition: PagesLocaleRouteDefinition = {
      kind: RouteKind.PAGES,
      filename: '',
      bundlePath: '',
      page: '',
      pathname: '/en-US/some/path',
      i18n: {
        detectedLocale: 'en-US',
        pathname: '/some/path',
      },
    }
    const matcher = new LocaleRouteMatcher(definition)
    const provider: RouteMatcherProvider = {
      matchers: jest.fn(async () => [matcher]),
    }
    manager.push(provider)
    await manager.load()

    const options: MatchOptions = {
      i18n: {
        detectedLocale: undefined,
        pathname: '/some/path',
        inferredFromDefault: false,
      },
      matchedOutputPathname: undefined,
    }
    const match = await manager.match('/en-US/some/path', options)
    expect(match?.definition).toBe(definition)
  })

  it('will match a route that is not locale aware when it was inferred from the default locale', async () => {
    const manager = new DefaultRouteMatcherManager()
    const definition: AppPageRouteDefinition = {
      kind: RouteKind.APP_PAGE,
      filename: '',
      bundlePath: '',
      page: '',
      pathname: '/some/path',
      appPaths: [],
    }
    const matcher = new DefaultRouteMatcher(definition)
    const provider: RouteMatcherProvider = {
      matchers: jest.fn(async () => [matcher]),
    }
    manager.push(provider)
    await manager.load()

    const options: MatchOptions = {
      i18n: {
        detectedLocale: 'en-US',
        pathname: '/some/path',
        inferredFromDefault: true,
      },
      matchedOutputPathname: undefined,
    }
    const match = await manager.match('/en-US/some/path', options)
    expect(match?.definition).toBe(definition)
  })
})
