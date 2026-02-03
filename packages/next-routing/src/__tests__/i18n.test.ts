import {
  detectDomainLocale,
  normalizeLocalePath,
  getAcceptLanguageLocale,
  getCookieLocale,
  detectLocale,
} from '../i18n'
import type { I18nConfig } from '../i18n'

describe('i18n utilities', () => {
  describe('detectDomainLocale', () => {
    const domains = [
      { domain: 'example.com', defaultLocale: 'en', locales: ['en', 'en-US'] },
      { domain: 'example.fr', defaultLocale: 'fr' },
      { domain: 'example.de:3000', defaultLocale: 'de' },
    ]

    it('should detect locale by hostname', () => {
      expect(detectDomainLocale(domains, 'example.com')).toEqual(domains[0])
      expect(detectDomainLocale(domains, 'example.fr')).toEqual(domains[1])
    })

    it('should detect locale by hostname without port', () => {
      expect(detectDomainLocale(domains, 'example.de')).toEqual(domains[2])
    })

    it('should detect locale by detected locale', () => {
      expect(detectDomainLocale(domains, 'other.com', 'fr')).toEqual(domains[1])
      expect(detectDomainLocale(domains, 'other.com', 'en-US')).toEqual(
        domains[0]
      )
    })

    it('should return undefined for no match', () => {
      expect(detectDomainLocale(domains, 'unknown.com')).toBeUndefined()
      expect(detectDomainLocale(undefined, 'example.com')).toBeUndefined()
    })

    it('should be case-insensitive', () => {
      expect(detectDomainLocale(domains, 'EXAMPLE.COM')).toEqual(domains[0])
      expect(detectDomainLocale(domains, 'other.com', 'FR')).toEqual(domains[1])
    })
  })

  describe('normalizeLocalePath', () => {
    const locales = ['en', 'fr', 'de', 'en-US']

    it('should detect and remove locale from pathname', () => {
      expect(normalizeLocalePath('/en/about', locales)).toEqual({
        pathname: '/about',
        detectedLocale: 'en',
      })
      expect(normalizeLocalePath('/fr/products/item', locales)).toEqual({
        pathname: '/products/item',
        detectedLocale: 'fr',
      })
    })

    it('should handle root path with locale', () => {
      expect(normalizeLocalePath('/en', locales)).toEqual({
        pathname: '/',
        detectedLocale: 'en',
      })
    })

    it('should return original pathname when no locale detected', () => {
      expect(normalizeLocalePath('/about', locales)).toEqual({
        pathname: '/about',
      })
      expect(normalizeLocalePath('/', locales)).toEqual({
        pathname: '/',
      })
    })

    it('should be case-insensitive', () => {
      expect(normalizeLocalePath('/EN/about', locales)).toEqual({
        pathname: '/about',
        detectedLocale: 'en',
      })
      expect(normalizeLocalePath('/Fr/products', locales)).toEqual({
        pathname: '/products',
        detectedLocale: 'fr',
      })
    })

    it('should handle locales with hyphens', () => {
      expect(normalizeLocalePath('/en-US/about', locales)).toEqual({
        pathname: '/about',
        detectedLocale: 'en-US',
      })
    })
  })

  describe('getAcceptLanguageLocale', () => {
    const locales = ['en', 'fr', 'de', 'ja']

    it('should parse simple accept-language header', () => {
      expect(getAcceptLanguageLocale('fr', locales)).toBe('fr')
      expect(getAcceptLanguageLocale('de', locales)).toBe('de')
    })

    it('should parse accept-language with quality values', () => {
      expect(getAcceptLanguageLocale('fr;q=0.9,en;q=0.8', locales)).toBe('fr')
      expect(getAcceptLanguageLocale('en;q=0.8,fr;q=0.9', locales)).toBe('fr')
    })

    it('should handle multiple locales', () => {
      expect(getAcceptLanguageLocale('ja,en;q=0.9,fr;q=0.8', locales)).toBe(
        'ja'
      )
    })

    it('should match prefix for regional variants', () => {
      expect(getAcceptLanguageLocale('fr-FR', locales)).toBe('fr')
      expect(getAcceptLanguageLocale('en-US,en;q=0.9', locales)).toBe('en')
    })

    it('should return undefined for no match', () => {
      expect(getAcceptLanguageLocale('es', locales)).toBeUndefined()
      expect(getAcceptLanguageLocale('', locales)).toBeUndefined()
    })

    it('should handle malformed headers gracefully', () => {
      expect(getAcceptLanguageLocale('invalid;;;', locales)).toBeUndefined()
    })
  })

  describe('getCookieLocale', () => {
    const locales = ['en', 'fr', 'de']

    it('should extract locale from NEXT_LOCALE cookie', () => {
      expect(getCookieLocale('NEXT_LOCALE=fr', locales)).toBe('fr')
      expect(getCookieLocale('NEXT_LOCALE=de', locales)).toBe('de')
    })

    it('should handle multiple cookies', () => {
      expect(
        getCookieLocale('session=abc123; NEXT_LOCALE=fr; theme=dark', locales)
      ).toBe('fr')
    })

    it('should be case-insensitive for locale value', () => {
      expect(getCookieLocale('NEXT_LOCALE=FR', locales)).toBe('fr')
      expect(getCookieLocale('NEXT_LOCALE=De', locales)).toBe('de')
    })

    it('should return undefined for no match', () => {
      expect(getCookieLocale('NEXT_LOCALE=es', locales)).toBeUndefined()
      expect(getCookieLocale('session=abc123', locales)).toBeUndefined()
      expect(getCookieLocale('', locales)).toBeUndefined()
      expect(getCookieLocale(undefined, locales)).toBeUndefined()
    })

    it('should handle URL-encoded values', () => {
      expect(getCookieLocale('NEXT_LOCALE=fr%2DFR', locales)).toBeUndefined()
    })
  })

  describe('detectLocale', () => {
    const i18nConfig: I18nConfig = {
      defaultLocale: 'en',
      locales: ['en', 'fr', 'de', 'ja'],
      domains: [
        { domain: 'example.com', defaultLocale: 'en' },
        { domain: 'example.fr', defaultLocale: 'fr' },
      ],
    }

    it('should prioritize locale in pathname', () => {
      const result = detectLocale({
        pathname: '/fr/about',
        hostname: 'example.com',
        cookieHeader: 'NEXT_LOCALE=de',
        acceptLanguageHeader: 'ja',
        i18n: i18nConfig,
      })
      expect(result.locale).toBe('fr')
      expect(result.pathnameWithoutLocale).toBe('/about')
      expect(result.localeInPath).toBe(true)
    })

    it('should use domain locale when no locale in path', () => {
      const result = detectLocale({
        pathname: '/about',
        hostname: 'example.fr',
        cookieHeader: undefined,
        acceptLanguageHeader: undefined,
        i18n: i18nConfig,
      })
      expect(result.locale).toBe('fr')
      expect(result.localeInPath).toBe(false)
    })

    it('should use cookie locale when no path or domain match', () => {
      const result = detectLocale({
        pathname: '/about',
        hostname: 'other.com',
        cookieHeader: 'NEXT_LOCALE=de',
        acceptLanguageHeader: 'ja',
        i18n: i18nConfig,
      })
      expect(result.locale).toBe('de')
      expect(result.localeInPath).toBe(false)
    })

    it('should use accept-language when no other match', () => {
      const result = detectLocale({
        pathname: '/about',
        hostname: 'other.com',
        cookieHeader: undefined,
        acceptLanguageHeader: 'ja,en;q=0.9',
        i18n: i18nConfig,
      })
      expect(result.locale).toBe('ja')
      expect(result.localeInPath).toBe(false)
    })

    it('should fallback to default locale', () => {
      const result = detectLocale({
        pathname: '/about',
        hostname: 'other.com',
        cookieHeader: undefined,
        acceptLanguageHeader: undefined,
        i18n: i18nConfig,
      })
      expect(result.locale).toBe('en')
      expect(result.localeInPath).toBe(false)
    })

    it('should use default locale when localeDetection is disabled', () => {
      const result = detectLocale({
        pathname: '/about',
        hostname: 'other.com',
        cookieHeader: 'NEXT_LOCALE=fr',
        acceptLanguageHeader: 'ja',
        i18n: { ...i18nConfig, localeDetection: false },
      })
      expect(result.locale).toBe('en')
      expect(result.localeInPath).toBe(false)
    })

    it('should respect domain locale even with localeDetection disabled', () => {
      const result = detectLocale({
        pathname: '/about',
        hostname: 'example.fr',
        cookieHeader: 'NEXT_LOCALE=de',
        acceptLanguageHeader: 'ja',
        i18n: { ...i18nConfig, localeDetection: false },
      })
      expect(result.locale).toBe('fr')
      expect(result.localeInPath).toBe(false)
    })
  })
})
