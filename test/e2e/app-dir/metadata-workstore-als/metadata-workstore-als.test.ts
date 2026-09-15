import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata workStore ALS across static prerender workers', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should prerender localized generateMetadata without InvariantError E1068', async () => {
    const $ = await next.render$('/en')
    expect($('#locale').text()).toBe('en')
    expect($('title').text()).toContain('workStore locale en')

    expect(next.cliOutput).not.toContain(
      'Expected workStore to be initialized'
    )
    expect(next.cliOutput).not.toContain('InvariantError')
  })

  if (isNextStart) {
    it('should render all locales generated from generateStaticParams', async () => {
      const locales = [
        'en',
        'de',
        'fi',
        'ka',
        'fr',
        'es',
        'it',
        'pl',
        'nl',
        'pt',
      ]

      for (const lang of locales) {
        const $ = await next.render$(`/${lang}`)
        expect($('#locale').text()).toBe(lang)
        expect($('title').text()).toContain(`workStore locale ${lang}`)
      }

      expect(next.cliOutput).not.toContain(
        'Expected workStore to be initialized'
      )
      expect(next.cliOutput).not.toContain('InvariantError')
    })
  }
})
