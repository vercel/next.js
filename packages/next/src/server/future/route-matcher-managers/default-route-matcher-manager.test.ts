import { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import { PagesLocaleRouteDefinition } from '../route-definitions/pages-route-definition'
import { RouteKind } from '../route-kind'
import { RouteMatcherProvider } from '../route-matcher-providers/route-matcher-provider'
import { LocaleRouteMatcher } from '../route-matchers/locale-route-matcher'
import { RouteMatcher } from '../route-matchers/route-matcher'
import { DefaultRouteMatcherManager } from './default-route-matcher-manager'
import { MatchOptions } from './route-matcher-manager'

describe('DefaultRouteMatcherManager', () => {
  it('will throw an error when used before it has been reloaded', async () => {
    const manager = new DefaultRouteMatcherManager()
    await expect(manager.match('/some/not/real/path', {})).resolves.toEqual(
      null
    )
    manager.add({
      provide: jest.fn(async () => []),
    })
    await expect(manager.match('/some/not/real/path', {})).rejects.toThrow()
    await manager.forceReload()
    await expect(manager.match('/some/not/real/path', {})).resolves.toEqual(
      null
    )
  })

  it('will not error and not match when no matchers are provided', async () => {
    const manager = new DefaultRouteMatcherManager()
    await manager.forceReload()
    await expect(manager.match('/some/not/real/path', {})).resolves.toEqual(
      null
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
      },
      definition: {
        kind: RouteKind.PAGES,
        filename: '',
        bundlePath: '',
        page: '',
        pathname: '/some/path',
        i18n: {
          locale: 'nl-NL',
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
      },
      definition: {
        kind: RouteKind.PAGES,
        filename: '',
        bundlePath: '',
        page: '',
        pathname: '/some/path',
        i18n: {
          locale: 'en-US',
        },
      },
    },
    {
      pathname: '/some/path',
      options: {
        i18n: {
          pathname: '/some/path',
          inferredFromDefault: false,
        },
      },
      definition: {
        kind: RouteKind.PAGES,
        filename: '',
        bundlePath: '',
        page: '',
        pathname: '/some/path',
        i18n: {
          locale: 'en-US',
        },
      },
    },
  ])(
    'can handle locale aware matchers for $pathname and locale $options.i18n.detectedLocale',
    async ({ pathname, options, definition }) => {
      const manager = new DefaultRouteMatcherManager()

      const matcher = new LocaleRouteMatcher(definition)
      const provider: RouteMatcherProvider = {
        provide: jest.fn(async () => [matcher]),
      }
      manager.add(provider)
      await manager.forceReload()

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
      pathname: '/some/path',
      i18n: {
        locale: 'en-US',
      },
    }
    const matcher = new LocaleRouteMatcher(definition)
    const provider: RouteMatcherProvider = {
      provide: jest.fn(async () => [matcher]),
    }
    manager.add(provider)
    await manager.forceReload()

    const options: MatchOptions = {
      i18n: {
        detectedLocale: undefined,
        pathname: '/some/path',
        inferredFromDefault: false,
      },
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
    const matcher = new RouteMatcher(definition)
    const provider: RouteMatcherProvider = {
      provide: jest.fn(async () => [matcher]),
    }
    manager.add(provider)
    await manager.forceReload()

    const options: MatchOptions = {
      i18n: {
        detectedLocale: 'en-US',
        pathname: '/some/path',
        inferredFromDefault: true,
      },
    }
    const match = await manager.match('/en-US/some/path', options)
    expect(match?.definition).toBe(definition)
  })
})
