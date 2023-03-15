import { I18NProvider } from './i18n-provider'

describe('I18NProvider', () => {
  const provider = new I18NProvider({
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
    it('should detect the correct default locale', () => {
      expect(provider.analyze('/fr', { defaultLocale: undefined })).toEqual({
        pathname: '/',
        detectedLocale: 'fr',
      })
      expect(
        provider.analyze('/fr/another/page', { defaultLocale: undefined })
      ).toEqual({
        pathname: '/another/page',
        detectedLocale: 'fr',
      })
      expect(
        provider.analyze('/another/page', { hostname: 'example.fr' })
      ).toEqual({
        pathname: '/another/page',
        detectedLocale: 'fr',
      })
      expect(
        provider.analyze('/another/page', { hostname: 'example.fr' })
      ).toEqual({
        pathname: '/another/page',
        detectedLocale: 'fr',
      })
      expect(
        provider.analyze('/another/page', {
          hostname: 'example.com',
          defaultLocale: 'en-CA',
        })
      ).toEqual({
        pathname: '/another/page',
        detectedLocale: 'en',
      })
      expect(
        provider.analyze('/en/another/page', {
          defaultLocale: 'en-CA',
        })
      ).toEqual({
        pathname: '/another/page',
        detectedLocale: 'en',
      })
    })
  })
})
