import { nextTestSetup } from 'e2e-utils'

describe('ppr-root-param-fallback', () => {
  const { next } = nextTestSetup({
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
      const $ = await next.render$(`/${locale}/blog/new-post`)
      const html = $.html()

      // The shell should have the locale-header with cached content,
      // even if Node streams flush the Suspense fallback before the resolved
      // content that replaces it.
      expect($('#locale-header').length).toBe(1)
      expect($('#locale-header').text()).toContain(`Locale: ${locale}`)
      expect($('#translations').text()).toContain(`Home (${locale})`)

      const localeLoading = $('#locale-loading')
      if (localeLoading.length > 0) {
        const fallbackTemplateId = localeLoading.prev('template').attr('id')
        const resolvedContentId = $('#locale-header')
          .parent('div[hidden]')
          .attr('id')

        expect(fallbackTemplateId).toBeTruthy()
        expect(resolvedContentId).toBeTruthy()
        expect(html).toContain(
          `$RC("${fallbackTemplateId}","${resolvedContentId}")`
        )
      }
    }
  })
})
