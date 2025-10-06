import type { DomainLocale } from '../config'
import { I18NProvider } from './i18n-provider'
import type { LocaleAnalysisResult } from './i18n-provider'

describe('I18NProvider', () => {
  const config = {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'en-CA'],
    domains: [
      {
        domain: 'example.com',
        defaultLocale: 'en',
        locales: ['en-CA'],
      },
      {
        domain: 'example.fr',
        defaultLocale: 'fr',
      },
    ],
  }
  const provider = new I18NProvider(config)

  describe('detectDomainLocale', () => {
    it.each<{
      domain: string | undefined
      detectedLocale: string | undefined
      expected: DomainLocale | undefined
    }>([
      // Verify domains.
      ...config.domains.map((domainLocale) => ({
        domain: domainLocale.domain,
        detectedLocale: undefined,
        expected: domainLocale,
      })),

      // Verify not-found domains.
      {
        domain: 'example.de',
        detectedLocale: undefined,
        expected: undefined,
      },

      // Verify that the other detected locale will support the domain.
      {
        domain: 'example.ca',
        detectedLocale: 'en-CA',
        expected: config.domains.find((domainLocale) =>
          domainLocale.locales?.includes('en-CA')
        ),
      },
    ])('for domain $domain', ({ domain, detectedLocale, expected }) => {
      expect(provider.detectDomainLocale(domain, detectedLocale)).toEqual(
        expected
      )
    })
  })

  it('should detect the correct domain locale', () => {
    expect(provider.detectDomainLocale('example.com')).toEqual({
      domain: 'example.com',
      defaultLocale: 'en',
      locales: ['en-CA'],
    })
    expect(provider.detectDomainLocale('example.fr')).toEqual({
      domain: 'example.fr',
      defaultLocale: 'fr',
    })
    expect(provider.detectDomainLocale('example.de')).toBeUndefined()
  })

  describe('analyze', () => {
    it.each<{
      pathname: string
      defaultLocale: string | undefined
      expected: LocaleAnalysisResult
    }>([
      // Verify un-prefixed index routes.
      {
        pathname: '/',
        defaultLocale: config.defaultLocale,
        expected: {
          pathname: '/',
          detectedLocale: config.defaultLocale,
          inferredFromDefault: true,
        },
      },

      // Verify un-prefixed other routes.
      {
        pathname: '/another/page',
        defaultLocale: config.defaultLocale,
        expected: {
          pathname: '/another/page',
          detectedLocale: config.defaultLocale,
          inferredFromDefault: true,
        },
      },

      // Verify locale prefixed index routes.
      ...config.locales.map((locale) => ({
        pathname: `/${locale}`,
        defaultLocale: config.defaultLocale,
        expected: {
          pathname: '/',
          detectedLocale: locale,
          inferredFromDefault: false,
        },
      })),

      // Verify locale prefixed other routes.
      ...config.locales.map((locale) => ({
        pathname: `/${locale}/another/page`,
        defaultLocale: config.defaultLocale,
        expected: {
          pathname: '/another/page',
          detectedLocale: locale,
          inferredFromDefault: false,
        },
      })),
    ])(
      'for pathname $pathname and defaultLocale $defaultLocale',
      ({ pathname, defaultLocale, expected }) => {
        expect(provider.analyze(pathname, { defaultLocale })).toEqual(expected)
      }
    )
  })
})
