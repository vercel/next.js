import { nextTestSetup } from 'e2e-utils'

describe('ppr-root-param-fallback', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should have use-cache content in fallback shells for all pregenerated locales', async () => {
    // Setup: The app has a [locale] param with generateStaticParams returning
    // ['en', 'fr'], and a nested /[locale]/blog/[slug] route. The layout uses
    // a 'use cache' function to fetch locale-specific translations.
    //
    // This test ensures that we generate fallback shells with the correct locale
    // filled in for all pregenerated locales.

    for (const locale of ['en', 'fr']) {
      // next.render$ doesn't stream, so we get just the shell content
      let $ = await next.render$(`/${locale}/blog/new-post`)

      // In dev the initial request fills the caches while streaming the
      // response. So we need to do a second page load after caches were filled
      // to get the production-like response.
      if (isNextDev) {
        $ = await next.render$(`/${locale}/blog/new-post`)
      }

      // The shell should have the locale-header with cached content,
      // NOT the locale-loading Suspense fallback
      expect($('#locale-header').length).toBe(1)
      expect($('#locale-header').text()).toContain(`Locale: ${locale}`)
      expect($('#translations').text()).toContain(`Home (${locale})`)

      // The Suspense fallback should NOT be in the shell
      expect($('#locale-loading').length).toBe(0)
    }
  })
})
