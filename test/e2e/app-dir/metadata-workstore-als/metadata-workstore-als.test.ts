import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata workStore ALS across static prerender workers', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should prerender localized generateMetadata without InvariantError E1068', async () => {
    expect(next.cliOutput).not.toContain(
      'Expected workStore to be initialized'
    )
    expect(next.cliOutput).not.toContain('InvariantError')

    const $ = await next.render$('/en')
    expect($('#locale').text()).toBe('en')
    expect($('title').text()).toContain('workStore locale en')
  })

  if (isNextStart) {
    it('should statically generate every locale from generateStaticParams', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      const routes = Object.keys(prerenderManifest.routes)
      for (const lang of [
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
      ]) {
        expect(routes).toContain(`/${lang}`)
      }
    })
  }
})
