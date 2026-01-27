import { resolveRoutes } from '../resolve-routes'
import type { ResolveRoutesParams } from '../types'

describe('resolveRoutes with i18n', () => {
  const baseParams: Omit<ResolveRoutesParams, 'url' | 'headers'> = {
    buildId: 'BUILD_ID',
    basePath: '',
    requestBody: new ReadableStream(),
    pathnames: ['/en/about', '/fr/about', '/de/about', '/about'],
    routes: {
      beforeMiddleware: [],
      beforeFiles: [],
      afterFiles: [],
      dynamicRoutes: [],
      onMatch: [],
      fallback: [],
    },
    invokeMiddleware: async () => ({ bodySent: false }),
  }

  const i18nConfig = {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de', 'ja'],
    domains: [
      { domain: 'example.com', defaultLocale: 'en' },
      { domain: 'example.fr', defaultLocale: 'fr' },
      { domain: 'example.de', defaultLocale: 'de' },
    ],
  }

  const i18nConfigNoDomains = {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'de', 'ja'],
  }

  describe('locale detection from accept-language header', () => {
    it('should redirect to locale prefix when accept-language is set', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'fr,en;q=0.9',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/fr/about')
      expect(result.redirect?.status).toBe(307)
    })

    it('should use quality values from accept-language', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'de;q=0.8,fr;q=0.9,en;q=0.7',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/fr/about')
    })

    it('should not redirect when locale matches default', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'en',
        }),
        i18n: i18nConfig,
      })

      // Should prefix internally but not redirect
      expect(result.redirect).toBeUndefined()
    })
  })

  describe('locale detection from cookie', () => {
    it('should redirect to locale from NEXT_LOCALE cookie', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          cookie: 'NEXT_LOCALE=ja',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/about')
    })

    it('should prioritize cookie over accept-language', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          cookie: 'session=abc; NEXT_LOCALE=ja; theme=dark',
          'accept-language': 'fr',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/about')
    })
  })

  describe('domain locale handling', () => {
    it('should use domain default locale without redirect', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.fr/about'),
        headers: new Headers({}),
        i18n: i18nConfig,
      })

      // Should not redirect since we're on the FR domain
      expect(result.redirect).toBeUndefined()
    })

    it('should redirect to correct domain for preferred locale', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'fr',
        }),
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.hostname).toBe('example.fr')
      expect(result.redirect?.url.pathname).toBe('/about')
    })

    it('should not include locale prefix for domain default locale', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.hostname).toBe('example.de')
      expect(result.redirect?.url.pathname).toBe('/about')
    })
  })

  describe('locale prefix in pathname', () => {
    it('should use locale from pathname', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/fr/about'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: i18nConfig,
      })

      // Path locale takes priority, so no redirect
      expect(result.redirect).toBeUndefined()
      expect(result.matchedPathname).toBe('/fr/about')
    })

    it('should handle locale prefix with trailing slash', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/fr/about/'),
        headers: new Headers({}),
        pathnames: ['/fr/about/', '/fr/about'],
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeUndefined()
      expect(result.matchedPathname).toBe('/fr/about/')
    })
  })

  describe('_next/data routes', () => {
    it('should not handle locale for _next/data routes', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        buildId: 'build123',
        url: new URL('http://example.com/_next/data/build123/about.json'),
        headers: new Headers({
          'accept-language': 'fr',
        }),
        i18n: i18nConfig,
        routes: {
          ...baseParams.routes,
          shouldNormalizeNextData: true,
        },
      })

      // Should not redirect for _next/data routes
      expect(result.redirect).toBeUndefined()
    })
  })

  describe('localeDetection disabled', () => {
    it('should not redirect when localeDetection is false', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about'),
        headers: new Headers({
          'accept-language': 'fr',
          cookie: 'NEXT_LOCALE=de',
        }),
        i18n: { ...i18nConfig, localeDetection: false },
      })

      // Should prefix internally with default locale but not redirect
      expect(result.redirect).toBeUndefined()
    })

    it('should still use domain locale when localeDetection is false', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.fr/about'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: { ...i18nConfig, localeDetection: false },
      })

      // Domain locale still applies
      expect(result.redirect).toBeUndefined()
    })
  })

  describe('basePath with i18n', () => {
    it('should handle basePath with locale prefix redirect', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        basePath: '/base',
        url: new URL('http://example.com/base/about'),
        headers: new Headers({
          'accept-language': 'ja',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/base/ja/about')
    })

    it('should handle basePath with domain redirect', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        basePath: '/base',
        url: new URL('http://example.com/base/about'),
        headers: new Headers({
          'accept-language': 'de',
        }),
        i18n: i18nConfig,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.hostname).toBe('example.de')
      expect(result.redirect?.url.pathname).toBe('/base/about')
    })
  })

  describe('edge cases', () => {
    it('should handle root path', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/'),
        headers: new Headers({
          'accept-language': 'ja',
        }),
        pathnames: ['/', '/ja/', '/en/'],
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/')
    })

    it('should handle query strings', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/about?foo=bar'),
        headers: new Headers({
          'accept-language': 'ja',
        }),
        i18n: i18nConfigNoDomains,
      })

      expect(result.redirect).toBeDefined()
      expect(result.redirect?.url.pathname).toBe('/ja/about')
      expect(result.redirect?.url.search).toBe('?foo=bar')
    })

    it('should skip locale handling for _next routes', async () => {
      const result = await resolveRoutes({
        ...baseParams,
        url: new URL('http://example.com/_next/static/chunk.js'),
        headers: new Headers({
          'accept-language': 'fr',
        }),
        i18n: i18nConfig,
      })

      // Should not redirect for _next routes
      expect(result.redirect).toBeUndefined()
    })
  })
})
